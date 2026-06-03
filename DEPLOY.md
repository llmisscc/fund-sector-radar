# 部署到 GitHub 并在线访问

这个项目有 Node 后端接口，完整实时版不能只用 GitHub Pages。当前仓库同时支持两种方式：

1. GitHub Pages 静态快照版：不用银行卡，能在线浏览市场和回测快照。
2. Vercel/Render 后端版：能运行完整实时接口、持仓穿透和组合优化。

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

## GitHub Pages 静态快照版

GitHub Free 账号下，GitHub Pages 需要 public 仓库。把仓库改为 public 后：

1. 打开仓库 `Settings`
2. 进入 `Pages`
3. `Build and deployment` 选择 `GitHub Actions`
4. 回到 `Actions`
5. 运行 `Deploy GitHub Pages`

部署完成后，访问：

```text
https://llmisscc.github.io/fund-sector-radar/
```

静态版说明：

- 支持在线查看市场快照、板块排序、候选方向、历史验证快照。
- 不支持实时 POST 接口，所以“分析持仓”和“组合优化”会提示使用本地 Node 版或后端部署版。
- GitHub Actions 会在推送代码时生成快照，并每 6 小时尝试刷新一次。

## Vercel 后端版

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
