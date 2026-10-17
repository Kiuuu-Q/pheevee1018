# Pheevee · 生日花园

生日贺卡、音乐、蛋糕、回忆相册与祝福便签。

GitHub Pages 发布根目录的 index.html。字体、插画、音乐均随网页托管。

开场贺卡里的花束由 `bloom3d.js` 用 Canvas 实时绘制（透视投影 + 逐瓣光照 + 阴影），随卡片打开逐层绽放，不使用位图。

照片、装饰与便签仍由 https://pheevee1018.surefrog16.chatgpt.site 的公开 API 保存，所有访客共享。此部署不是独立的国内后端迁移；后端不可达时共享功能不可用。不要在前端放置云服务密钥。

字体使用 Great Vibes，许可见 OFL.txt。

## 运行方式（国内托管版本）

站点现在自带一个零依赖 Node 服务：

```
node server.js          # 端口取 $PORT，默认 3000
```

- 静态文件由 `server.js` 直接托管；
- 祝福墙 / 小装饰 / 相册接口同源提供：`GET|POST /api/entries`、`POST /api/photo`、`GET /api/photo?key=`；
- 数据落在 `data/entries.json` 与 `data/photos/`，随应用目录保存；
- 部署到 WorkBuddy 应用托管，国内访问更快，且接口不再受跨域限制。
