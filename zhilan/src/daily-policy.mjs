// Daily practice uses the server clock and the Asia/Shanghai calendar.
const DAY=86400000,OFFSET=8*60*60*1000;
export const DAILY_COUNTS=Object.freeze({j:20,s:20,m:10});
export function dailyWindow(timestamp=Date.now()){
 const day=Math.floor((timestamp+OFFSET)/DAY);
 return {day:new Date(timestamp+OFFSET).toISOString().slice(0,10),resetsAt:(day+1)*DAY-OFFSET};
}
