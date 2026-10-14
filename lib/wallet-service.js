export class WalletError extends Error {
  constructor(code, status = 409) { super(code); this.status = status; }
}

export function normalizeOperationId(value) {
  const id = String(value || '');
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(id)) throw new WalletError('invalid_request_id', 400);
  return id;
}

export function createWalletService(sql) {
  async function financialState(playerId) {
    // Both values must come from one PostgreSQL snapshot, not separate requests.
    const rows = await sql`
      select to_jsonb(w) as wallet,
        coalesce((select jsonb_object_agg(item_id, quantity) from inventory where player_id = w.player_id), '{}'::jsonb) as inventory
      from wallets w where w.player_id = ${playerId}
    `;
    return rows[0];
  }
  async function grantStarter(playerId, amount) {
    await sql`
      with credited as (
        update wallets set coin_balance = ${amount}, lifetime_granted_coins = ${amount}, financial_revision = financial_revision + 1, updated_at = now()
        where player_id = ${playerId} and coin_balance = 0 and lifetime_granted_coins = 0
          and lifetime_purchased_coins = 0 and lifetime_spent_coins = 0 returning coin_balance
      ) insert into coin_ledger (player_id,type,amount,balance_after,reason,ref_type,ref_id)
        select ${playerId},'grant',${amount},coin_balance,'starter_bonus','system','starter_bonus' from credited
    `;
  }
  async function existingOperation(playerId, requestId, kind, payload) {
    const rows = await sql`select kind, payload from wallet_operations where player_id = ${playerId} and request_id = ${requestId}`;
    if (!rows.length) return null;
    const row = rows[0];
    if (row.kind !== kind || JSON.stringify(row.payload) !== JSON.stringify(JSON.parse(JSON.stringify(payload)))) {
      // jsonb key order is not guaranteed.
      if (row.kind !== kind || Object.keys(payload).length !== Object.keys(row.payload).length ||
          Object.keys(payload).some(key => row.payload[key] !== payload[key])) throw new WalletError('request_id_conflict');
    }
    return row;
  }

  async function spendItem(playerId, requestId, item, quantity) {
    normalizeOperationId(requestId);
    const cost = item.cost * quantity, payload = { itemId:item.id, quantity, cost };
    if (await existingOperation(playerId, requestId, 'spend', payload)) return {duplicate:true,cost};
    const rows = await sql`
      with locked as materialized (
        select coin_balance from wallets where player_id = ${playerId} for update
      ), claimed as (
        insert into wallet_operations (player_id, request_id, kind, payload)
        select ${playerId}, ${requestId}, 'spend', ${JSON.stringify(payload)}::jsonb
        from locked where coin_balance >= ${cost}
        on conflict (player_id, request_id) do nothing returning player_id
      ), debited as (
        update wallets set coin_balance = coin_balance - ${cost},
          lifetime_spent_coins = lifetime_spent_coins + ${cost}, financial_revision = financial_revision + 1, updated_at = now()
        where player_id = ${playerId} and exists (select 1 from claimed)
        returning coin_balance
      ), stored as (
        insert into inventory (player_id, item_id, quantity, updated_at)
        select ${playerId}, ${item.id}, ${quantity}, now() from debited
        on conflict (player_id, item_id) do update
          set quantity = inventory.quantity + excluded.quantity, updated_at = now()
      ), spent as (
        insert into item_spends (player_id, item_id, coin_cost, quantity)
        select ${playerId}, ${item.id}, ${cost}, ${quantity} from debited
      ), ledger as (
        insert into coin_ledger (player_id, type, amount, balance_after, reason, ref_type, ref_id, metadata)
        select ${playerId}, 'spend', ${-cost}, coin_balance, ${'buy_'+item.id}, 'wallet_operation', ${requestId}, ${JSON.stringify(payload)}::jsonb from debited
      ) select coin_balance from debited
    `;
    if (rows.length) return {duplicate:false,cost};
    if (await existingOperation(playerId, requestId, 'spend', payload)) return {duplicate:true,cost};
    throw new WalletError('not_enough_coins');
  }

  async function useItem(playerId, requestId, itemId) {
    normalizeOperationId(requestId);
    const payload = {itemId};
    if (await existingOperation(playerId, requestId, 'use', payload)) return {duplicate:true};
    const rows = await sql`
      with wallet_lock as materialized (
        select player_id from wallets where player_id = ${playerId} for update
      ), locked as materialized (
        select i.quantity from inventory i cross join wallet_lock w
        where i.player_id = w.player_id and i.item_id = ${itemId} for update of i
      ), claimed as (
        insert into wallet_operations (player_id, request_id, kind, payload)
        select ${playerId}, ${requestId}, 'use', ${JSON.stringify(payload)}::jsonb from locked where quantity > 0
        on conflict (player_id, request_id) do nothing returning player_id
      ), used as (
        update inventory set quantity = quantity - 1, updated_at = now()
        where player_id = ${playerId} and item_id = ${itemId} and exists (select 1 from claimed) returning quantity
      ), versioned as (
        update wallets set financial_revision = financial_revision + 1, updated_at = now()
        where player_id = ${playerId} and exists (select 1 from used) returning player_id
      ) select quantity from used cross join versioned
    `;
    if (rows.length) return {duplicate:false};
    if (await existingOperation(playerId, requestId, 'use', payload)) return {duplicate:true};
    throw new WalletError('item_not_owned');
  }

  async function creditPurchase(playerId, productId, purchaseToken, purchase, amount) {
    const rows = await sql`
      with locked as materialized (
        select player_id from wallets where player_id = ${playerId} for update
      ), claimed as (
        insert into google_play_purchases (purchase_token, player_id, product_id, order_id, purchase_state, quantity, coins_granted, raw_response)
        select ${purchaseToken}, ${playerId}, ${productId}, ${purchase.orderId || null}, 'credited_not_consumed', ${purchase.quantity || 1}, ${amount}, ${JSON.stringify(purchase)}::jsonb from locked
        on conflict (purchase_token) do update set purchase_state = 'credited_not_consumed',
          quantity = excluded.quantity, coins_granted = excluded.coins_granted, raw_response = excluded.raw_response,
          order_id = excluded.order_id
        where google_play_purchases.player_id = excluded.player_id
          and google_play_purchases.product_id = excluded.product_id and google_play_purchases.coins_granted = 0
        returning player_id
      ), credited as (
        update wallets set coin_balance = coin_balance + ${amount},
          lifetime_purchased_coins = lifetime_purchased_coins + ${amount}, financial_revision = financial_revision + 1, updated_at = now()
        where player_id = ${playerId} and exists (select 1 from claimed) returning coin_balance
      ), ledger as (
        insert into coin_ledger (player_id, type, amount, balance_after, reason, ref_type, ref_id, metadata)
        select ${playerId}, 'purchase', ${amount}, coin_balance, ${'google_play_'+productId}, 'google_play_purchase', ${purchaseToken}, ${JSON.stringify({productId,quantity:purchase.quantity || 1})}::jsonb from credited
      ) select coin_balance from credited
    `;
    if (rows.length) return {duplicate:false,coinsGranted:amount};
    const existing = await sql`select player_id, product_id, coins_granted from google_play_purchases where purchase_token = ${purchaseToken}`;
    if (existing[0]?.player_id !== playerId || existing[0]?.product_id !== productId) throw new WalletError('purchase_token_already_bound');
    if (!existing[0].coins_granted) throw new WalletError('purchase_credit_unavailable',503);
    return {duplicate:true,coinsGranted:existing[0].coins_granted};
  }

  async function grantRun(playerId, claim) {
    normalizeOperationId(claim.requestId);
    const existing = await sql`select base_coins from campaign_reward_claims where player_id = ${playerId} and request_id = ${claim.requestId}`;
    if (existing.length) return {duplicate:true};
    const rows = await sql`
      with locked as materialized (
        select player_id from wallets where player_id = ${playerId} for update
      ), claimed as (
        insert into campaign_reward_claims (player_id, request_id, level_id, base_coins, details)
        select ${playerId}, ${claim.requestId}, ${claim.levelId}, ${claim.baseCoins}, ${JSON.stringify(claim)}::jsonb from locked
        on conflict (player_id, request_id) do nothing returning player_id
      ), bonus as (
        insert into campaign_chapter_bonuses (player_id, level_id, request_id, coins)
        select ${playerId}, ${claim.levelId}, ${claim.requestId}, ${claim.chapterBonus} from claimed where ${claim.chapterBonus} > 0
        on conflict (player_id, level_id) do nothing returning coins
      ), credited as (
        update wallets set coin_balance = coin_balance + ${claim.baseCoins} + coalesce((select coins from bonus),0),
          lifetime_granted_coins = lifetime_granted_coins + ${claim.baseCoins} + coalesce((select coins from bonus),0), financial_revision = financial_revision + 1, updated_at = now()
        where player_id = ${playerId} and exists (select 1 from claimed) returning coin_balance
      ), ledger as (
        insert into coin_ledger (player_id, type, amount, balance_after, reason, ref_type, ref_id, metadata)
        select ${playerId}, 'grant', ${claim.baseCoins} + coalesce((select coins from bonus),0), coin_balance,
          'campaign_reward', 'campaign_run', ${claim.requestId}, ${JSON.stringify(claim)}::jsonb from credited
      ) select coin_balance from credited
    `;
    return {duplicate:!rows.length};
  }
  return {spendItem,useItem,creditPurchase,grantRun,grantStarter,financialState};
}
