const rareTitles = [
  '成功实现资产硬着陆',
  '飞机已经跌停，暂不支持复飞',
  '成功抄底地心',
  '经调查，坠机系玩家对走势过于乐观',
  '玩家已阵亡',
  '你已被市场出清',
  '您的飞机已触发强制平仓',
  '本事故系正常波动，请投资者理性看待',
];

export function gameOverTitle(completedRuns: number, random = Math.random): string {
  if (completedRuns === 0) return '游戏结束';
  const roll = random();
  if (roll < 0.6) return '飞行有风险，玩家需谨慎';
  if (roll < 0.8) return '下一次，飞得更远';
  return rareTitles[Math.min(rareTitles.length - 1, Math.floor((roll - 0.8) / 0.025))];
}
