export function createGooglePlayPurchaseHandler({sql, walletService, getPlayerState, getAndroidPublisher, products, packageName}) {
  return async (req, res) => {
    const productId = String(req.body?.productId || '').trim();
    const purchaseToken = String(req.body?.purchaseToken || '').trim();
    const product = products[productId];
    if (!product || product.kind !== 'coins') return res.status(400).json({error:'unknown_product'});
    if (!purchaseToken) return res.status(400).json({error:'missing_purchase_token'});
    if (purchaseToken.length > 4096) return res.status(400).json({error:'invalid_purchase_token'});

    const existingRows = await sql`
      select player_id, product_id, purchase_state, quantity, coins_granted, consumed_at
      from google_play_purchases where purchase_token = ${purchaseToken}
    `;
    const existing = existingRows[0];
    if (existing) {
      if (existing.player_id !== req.playerId || existing.product_id !== productId) {
        return res.status(409).json({error:'purchase_token_already_bound'});
      }
      if (existing.coins_granted > 0 && existing.consumed_at) {
        return res.json({state:await getPlayerState(req.playerId),purchase:{productId,quantity:existing.quantity,coinsGranted:existing.coins_granted},duplicate:true});
      }
    }

    const publisher = await getAndroidPublisher();
    if (!publisher) return res.status(503).json({error:'google_play_credentials_missing'});
    const request = {packageName,productId,token:purchaseToken};
    let purchase;
    try {
      purchase = (await publisher.purchases.products.get(request)).data || {};
    } catch {
      // Do not disclose provider errors, which can contain receipt tokens.
      return res.status(502).json({error:'google_play_verification_failed'});
    }
    const quantity = Math.max(1,Math.min(99,Number.parseInt(purchase.quantity,10)||1));
    if (purchase.purchaseState !== 0) {
      await sql`
        insert into google_play_purchases (purchase_token,player_id,product_id,order_id,purchase_state,quantity,coins_granted,raw_response)
        values (${purchaseToken},${req.playerId},${productId},${purchase.orderId||null},${String(purchase.purchaseState??'unknown')},${quantity},0,${JSON.stringify(purchase)}::jsonb)
        on conflict (purchase_token) do nothing
      `;
      return res.status(409).json({error:'purchase_not_completed',purchaseState:purchase.purchaseState});
    }
    // An already-consumed token without a previous local credit is not a new purchase.
    if (purchase.consumptionState === 1 && !existing?.coins_granted) {
      return res.status(409).json({error:'purchase_already_consumed'});
    }
    const credit = await walletService.creditPurchase(req.playerId,productId,purchaseToken,{...purchase,quantity},(product.coins+product.bonus)*quantity);
    let consumptionPending = false;
    try {
      if (purchase.consumptionState !== 1) await publisher.purchases.products.consume(request);
      await sql`update google_play_purchases set consumed_at=now(),purchase_state='consumed' where purchase_token=${purchaseToken}`;
    } catch {
      consumptionPending = true;
      await sql`update google_play_purchases set purchase_state='credited_not_consumed' where purchase_token=${purchaseToken} and consumed_at is null`;
    }
    return res.json({state:await getPlayerState(req.playerId),purchase:{productId,quantity,coinsGranted:credit.coinsGranted},duplicate:credit.duplicate,consumptionPending});
  };
}
