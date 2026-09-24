# 音频占位目录

将可替换的音频文件放在此目录，并在 `PreloadScene.ts` 用对应的 key 加载：`jump`、`land`、`coin`、`throw`、`enemy-hit`、`hurt`、`win`、`lose`、`button`、`bgm`。当前没有原版音频素材，`AudioManager` 会安全地跳过未加载资源，不会阻断游戏。
