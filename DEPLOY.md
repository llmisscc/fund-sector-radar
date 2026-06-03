# 部署到 GitHub 并在线访问

这个项目有 Node 后端接口，不能只用 GitHub Pages。推荐流程是：

1. 把代码推到 GitHub。
2. 在 Vercel 导入这个 GitHub 仓库。
3. Vercel 会读取 `vercel.json`，自动部署成一个可在线访问的网址。

## 推到 GitHub

如果这是这台电脑第一次提交 Git，先设置用户名和邮箱：

```powershell
git config --global user.name "你的名字"
git config --global user.email "你的邮箱"
```

然后提交并推送：

```powershell
git init
git branch -M main
git add .
git commit -m "Initial deployable fund radar"
git remote add origin https://github.com/你的用户名/你的仓库名.git
git push -u origin main
```

## 在 Vercel 部署

1. 打开 https://vercel.com
2. 使用 GitHub 登录
3. 点击 `Add New...` -> `Project`
4. 导入 `fund-sector-radar` 仓库
5. Framework Preset 选择 `Other`
6. Build Command 留空或填 `echo no-build`
7. Output Directory 留空
8. 点击 `Deploy`

部署完成后，Vercel 会给你一个类似下面的网址：

```text
https://fund-sector-radar.vercel.app
```

打开这个网址就能在线访问。

## Render 备用部署

1. 打开 https://render.com
2. 使用 GitHub 登录
3. New + -> Blueprint
4. 选择刚才的 GitHub 仓库
5. 确认服务名、免费套餐和 `render.yaml`
6. 点击 Deploy

部署完成后，Render 会给你一个类似下面的网址：

```text
https://fund-sector-radar.onrender.com
```

打开这个网址就能在线访问。

## 为什么不用 GitHub Pages

GitHub Pages 只能发布静态文件，不能运行 `server.js`。本项目的数据刷新、历史回测、组合优化都依赖后端接口，所以需要 Render、Railway、Fly.io、Vercel 等能运行 Node 的平台。
