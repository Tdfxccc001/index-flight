import test from 'node:test';
import assert from 'node:assert/strict';
import { gameOverTitle } from '../src/ui/GameOverTitle';

test('first flight has the fixed title; later titles follow the current 60/20/20 weights', () => {
  assert.equal(
    gameOverTitle(0, () => 0.99),
    '游戏结束',
  );
  const counts = new Map<string, number>();
  for (let i = 0; i < 10000; i++) {
    const title = gameOverTitle(1, () => (i + 0.5) / 10000);
    counts.set(title, (counts.get(title) ?? 0) + 1);
  }
  assert.equal(counts.get('飞行有风险，玩家需谨慎'), 6000);
  assert.equal(counts.get('下一次，飞得更远'), 2000);
  for (const title of [
    '成功实现资产硬着陆',
    '飞机已经跌停，暂不支持复飞',
    '成功抄底地心',
    '经调查，坠机系玩家对走势过于乐观',
    '玩家已阵亡',
    '你已被市场出清',
    '您的飞机已触发强制平仓',
    '本事故系正常波动，请投资者理性看待',
  ])
    assert.equal(counts.get(title), 250);
  assert.equal(counts.size, 10);
});
