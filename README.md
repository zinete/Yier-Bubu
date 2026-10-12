# 一儿布布冒险记（Phaser 3 迁移版）

## 运行

```bash
pnpm install
pnpm dev
pnpm build
pnpm preview
```

## 功能对应表

| 原 Canvas 功能                     | Phaser 3 实现                                          |
| ---------------------------------- | ------------------------------------------------------ |
| `requestAnimationFrame` 与手工碰撞 | Arcade Physics、静态平台组与碰撞器                     |
| 自制相机坐标                       | `Camera.startFollow`、deadzone、world bounds           |
| 内嵌角色 PNG                       | `src/assets/sprites/characters.png` spritesheet 与动画 |
| 键盘/DOM 触摸按钮                  | `InputManager` 与 UIScene 多点虚拟控制                 |
| 手工状态/HUD                       | Registry 数据事件和独立 UIScene                        |

## 主要物理参数

参数集中在 `src/config/constants.ts`。`COYOTE_TIME=125ms` 为离台后跳跃宽限，`JUMP_BUFFER_TIME=135ms` 为提前按跳的缓存；`JUMP_CUT_MULTIPLIER=0.45` 使短按更低；上升和下落分别使用 `NORMAL_GRAVITY`、`FALL_GRAVITY`，下落更快。视觉精灵为约 79×88；`CharacterBody` 根据各角色所有动画帧的非透明范围计算固定矩形碰撞体，覆盖完整角色，并随精灵统一缩放。碰撞体不随动画切帧改变。

## 移动端操作

触控设备会自动显示控制器：左下角虚拟摇杆左右拖动移动，右下角“跳”和“投”可与摇杆同时按住。游戏启用了四点触控、`touch-action: none` 和横屏提示；窄屏设备会以全宽适配并保留刘海安全区。

## 地图安全范围

`LevelValidator` 在开发环境根据跳速、重力和最大水平速度估算高度与距离，并对相邻平台危险跳跃给出控制台警告。主线平台间隔应保持在理论最大距离的 65%～75%（当前采用约 70%），落地区至少留一个角色宽度；较大坑洞应加入桥接平台，高台前加入过渡平台。

## 添加新关卡

1. 在 `src/levels/` 创建新关卡并复用 `LevelData`（当前已有 1-1 和 1-2）。
2. 为平台、星星、敌人和出生/终点填写数据后调用 `LevelValidator.validate`。
3. 在 `src/levels/index.ts` 的 `levels` 中注册，游戏、解锁和下一关逻辑会按顺序读取。
4. 保持主线路径满足安全范围，再为支线添加更高难度奖励。

## 尚未完成事项

- 当前音频由 `GeneratedAudio` 生成 WAV 音乐与音效；后续可在 `PreloadScene` 替换为美术/音频团队提供的授权资源。
- 自动检查：`pnpm test`、`pnpm lint`、`pnpm build`。交互验收见 `docs/迭代2与3验收记录.md`。
- 触屏真机、完整两关通关与音频听感仍需按验收清单检查。
