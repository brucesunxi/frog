import '../assets/campaign.js';
import { WalletError, normalizeOperationId } from './wallet-service.js';

const campaign = globalThis.FrogCampaign;
function integer(value,min,max) {
  if (!Number.isInteger(value) || value<min || value>max) throw new WalletError('invalid_run_summary',400);
  return value;
}
export function normalizeRunReward(body = {}) {
  const requestId=normalizeOperationId(body.requestId),levelId=integer(body.levelId,1,campaign.COUNT);
  const durationMs=integer(body.durationMs,0,7_200_000),deaths=integer(body.deaths,0,99);
  const normalFlies=integer(body.normalFlies,0,1000),goldenFlies=integer(body.goldenFlies,0,1000);
  const contractFlies=integer(body.contractFlies ?? normalFlies+goldenFlies,0,1000);
  const lives=integer(body.lives,0,5),combo=integer(body.combo,0,5),cfg=campaign.getLevel(levelId);
  if (!['complete','fail','quit'].includes(body.result)) throw new WalletError('invalid_run_result',400);
  // Bound free gameplay rewards; client summaries are not purchase verification.
  if(Math.max(normalFlies+goldenFlies,contractFlies)>Math.floor(durationMs/1200)+2) throw new WalletError('impossible_fly_count',400);
  let baseCoins=normalFlies*5+goldenFlies*12,chapterBonus=0,stars=0;
  if(body.result==='complete') {
    if(durationMs<cfg.homesNeeded*13*7*1000/60) throw new WalletError('impossible_run_duration',400);
    stars=campaign.getStars(Math.round(durationMs*60/1000),cfg.timeLimit,cfg.homesNeeded,deaths);
    const contract=campaign.getContract(levelId);
    const complete=contract.type==='combo'?combo>=contract.target:contract.type==='flies'?contractFlies>=contract.target:contract.type==='safe'?lives>=contract.target:deaths===0;
    const reward=campaign.getReward(levelId,stars,complete,true);
    baseCoins+=reward.clear+reward.contract;chapterBonus=reward.milestone;
  }
  if(baseCoins+chapterBonus===0) throw new WalletError('no_reward_to_claim',400);
  return {requestId,levelId,durationMs,deaths,normalFlies,goldenFlies,lives,combo,result:body.result,stars,baseCoins,chapterBonus};
}
