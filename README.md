# 亚马逊运营雷达

正式网址：[运营雷达](https://amazon-ops-radar-vercel.vercel.app/)。源码仓库：justinzza/1，生产分支：main。现有 Vercel 项目不变。

## 当前实现

- `data/events.json` 是唯一事件库。稳定 event_key 由主体、变化动作、适用站点、生效日期组成；日期更正保留原 key 并增加别名。
- `lib/events.mjs` 校验 key、标题、来源链接、日期与站点，合并来源和原卡片更新。标题**语义**判断由运行任务逐条做出，程序要求完整比对基准摘要和判断记录；不声称字符串匹配能替代语义审核。
- `data/report.json` 仅保存最近有实质内容变化的一期；`index.html` 由纯静态渲染器生成，不依赖浏览器读取外部新闻。
- `main` 的内容提交由已连接的 Vercel 自动发布；`radar-state` 分支只保存任务记录和成功检查进度，配置为不部署。
- 原版11张卡片中的2张混合卡片已拆分，2处重复出现已合并，最终11个独立事件。原文完整保存在 `archive/legacy-source-20260831.txt`。导入不是新闻新增；所有旧记录均标为未重新核验。
- 五类标准摘要、美国站优先筛选、稳定事件锚点、本机行动清单保存。

本仓库没有自行联网抓新闻的后台或 Vercel Cron。采集、原文核验、标题语义比对及提交由现有 ChatGPT 每日任务执行； GitHub 连接本身不会自动产生新闻。首次完整采集尚需实际运行验收，不能把源码接通当作全来源新闻核验成功。

## 操作入口

不需要每天手工编辑 Vercel 或上传文件。维护者及每日任务按 `AUTOMATION_RUNBOOK.md` 执行；完整范围见 `OPERATING_RULES.md`，来源清单见 `config/sources.json`。

无需 npm 安装，使用 Node.js 内置模块：

```sh
node --test tests/*.test.mjs
node scripts/radar.mjs snapshot
node scripts/radar.mjs stage /temporary/batch.json /temporary/staged-radar
node scripts/radar.mjs check
```

`stage` 不会直接改生产源码。没有实质变化时只输出运行结果，以及必要的待合并元数据；不产生新的网页。检查成功或失败的记录必须写入 `radar-state`，不要为记录“无新增”提交 main。

`render` 为经过校验的数据生成页面。新闻更新时优先使用 `stage`，确认全部通过后将事件库、报表和页面放入同一个提交。

## 验收与安全

生产成功需要 GitHub 上对应提交的 Vercel 状态成功，且正式域名页面与预期内容摘要一致。仅收到提交 SHA、HTTP 200、部署开始或插件通用成功消息都不够。

网站、代码和任务分支位于公开仓库，只存公开情报和不含凭证的运行记录。不得提交密码、Token、cookie、`.env`、账户后台隐私数据或访问受限文章；不得绕过登录、验证码或付费墙。没有任何钉钉推送代码或配置。
