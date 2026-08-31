# 每次增量运行操作手册

这是现有每日任务的执行手册，不是新增的调度器。严禁为本流程再创建重复自动任务。

## 1. 读取基准，不盲写

1. 使用 GitHub 应用读取 `justinzza/1` 的 `main` HEAD、当前树、`data/events.json`、`data/report.json`、`index.html`、`config/sources.json` 和本手册。运行脚本需要 `lib/`、`scripts/`、`tests/` 和 `styles.css`/`app.js`。可在干净临时目录用已授权 Git 或 GitHub 应用取回源码；不要依赖上次运行的临时文件。
2. 读取 `radar-state` 分支的 `state/checkpoint.json` 和必要的 `state/runs/` 最近记录。此分支可能保留旧版代码，**程序与新闻基准必须以 main 为准**，仅状态文件读取 radar-state。
3. 若读不到 main、旧事件库或状态记录，不覆盖网站、不重建空库、不把失败说成无新增。报告具体阻塞点。
4. 先处理 `pending_publication`：核实其中提交在正式域名的版本。如已发布则按当时来源检查结果完成记录；否则从保存的批次恢复，查明失败后安全重试。不能将待发布更新当作已完成。
5. 首轮 `last_successful_run_at` 为 null 时，从 `bootstrap_window_start`（北京时间2026-08-28零点）补查，包含8月29、30日。旧页面自称“已核验/无新增”不是成功记录。以后各来源使用它自己的 `last_successful_check_at`，失败来源从更早基准补查。检索可保留72小时重叠以覆盖延迟收录，但重复内容必须去重。

## 2. 分层检索和原文核验

先完成来源清单中的第一层，再第二层。每一个来源都写检查状态，不得只搜索几个网站就声称全源检查完成。未知入口先通过检索确认媒体和公众号身份，不猜域名、不把同名栏目算作独立证据。

公众号只使用无需登录即可公开检索或访问的文章，不绕过登录、验证码、限制或付费墙。只有摘要或搜索不到时分别记 `public_search_only` / `not_checked`，不等于已看完全部文章；若明确遇到登录/限制记 `blocked`。检索到直接支持事件的官方原文时升级主来源，不能仅凭 Amazon 域名把卖家帖子认定为官方公告。

每条记录实际发布时间（未知用 null 并写明）、站点、生效日期（未知用 null）、来源链接、核验时间、可信度、影响、可执行动作。办理截止日与生效日分开；不要把抓取时间冒充发布时间。事实与推测分开，推测不能升级为确认变化。

分类固定为 policy / ads / ai / opportunities / competitors。常规覆盖 US（Amazon.com）、CA（Amazon.ca）、MX（Amazon.com.mx），美国站优先；其他站点和公司生态变化须标清范围。重点汽车用品关键词：fuel line、CPE braided fuel hose、AN fittings、exhaust clamp。没有指定竞品ASIN或对照快照时，明确“缺少可比基线”，不编造价格/Coupon/BSR变化；可在状态分支建立公开样本ASIN与观察时间、变体、地域、价格币种和来源快照。首次快照不是增量趋势。

### 加拿大 / 墨西哥范围扩展（2026-08-31）

- config/sources.json 新增八个独立来源记录，分别追踪 CA/MX 官方公告及 Amazon Ads/全球开店补查、监管原文、行业/公众号、汽车用品关键词与竞品。所有来源先第一层后第二层；新增站点从 bootstrap_window_start 补查，不继承美国来源的成功时间，也不将这次设置当作检查成功。
- industry_wechat_ca/mx 必须逐一检查 include_source_ids 的所有媒体和账号，记录逐来源证据及限制；仅当该组全部完整检查才可标 checked，否则部分检索记录 public_search_only，不能推进全组成功游标。
- 报告和任务记录分别说明 US/CA/MX 的实际覆盖情况；仅新建范围或首次价格快照不能称新闻新增。保留现有US历史与失败游标。
- 多站同一事件若主体、动作、生效日一致，合并到一张卡片；扩展适用站点时 dedupe_review.matches_event_key 指向原事件，material_update=true，更新 marketplaces 的已证实并集，并保留原 key 与别名。不同规则/生效日才分开。不能按站点复制三份同一新闻。
- 价格/促销记录 USD/CAD/MXN、税费/运费口径；BSR和关键词分别按站点、类目、ASIN、变体、时间建立基线，禁止直接跨站比较。

## 3. 四重比对与候选批次

运行 `node scripts/radar.mjs snapshot` 获取当前事件摘要和 digest。所有候选要对整个事件库及**本批候选之间**进行 event_key、标题语义、规范化来源链接和生效日期四重比对。

同一事件仅一个卡片；同文章不同事项可以拆开。主体/动作必须沿用已有规范词，不要因不同标题或转载改名。同一事件延期或日期从未知变已知，指定现有 key；不可仅因日期变化新增卡片。

批次示意（值必须替换成实际证据，不能原样发布）：

```json
{
  "base_digest": "snapshot输出的digest",
  "checked_at": "实际带时区的时间",
  "candidates": [{
    "event": "完整事件对象；字段参考data/events.json及normalizeEvent，verification_status必须为reviewed",
    "dedupe_review": {
      "compared_digest": "同base_digest",
      "title_semantics_reviewed": true,
      "batch_semantics_reviewed": true,
      "matches_event_key": null,
      "reason": "实际说明与现有标题、主体、站点、日期、链接相比为何是新增或同一事项",
      "distinct_event_reason": "若同文章包含不同事项或同主体的不同期变化，在此说明；否则可省略"
    },
    "material_update": false,
    "update_reason": "只有更新原卡片实质事实时才设material_update=true并说明变化"
  }],
  "report": {
    "status": "complete或partial，完整检查不得伪报",
    "top_changes": ["本期实际新增/更新事件key，最多3条，不足不凑数"],
    "category_coverage": {"policy":"complete或partial或not_checked","ads":"同前","ai":"同前","opportunities":"同前","competitors":"同前"},
    "coverage_note": "实际核验范围与限制",
    "action_items": [{"title":"可执行动作","detail":"具体说明","due":"时点","event_key":null}]
  }
}
```

event.sources 每项包含 url、publisher、kind、published_at、verified_at、supports_event、authority_confirmed。kind 优先级：official / regulator > industry_original > aggregator > wechat / seller_forum > unverified。official/regulator 必须有直接支持该事件的原文和已核实官方发布身份；既有导入记录不满足此条件。程序不代替事实核验。

`node scripts/radar.mjs stage /temporary/batch.json /temporary/staged-radar` 先在临时目录生成结果，不能直接改生产文件。检查 `result.json` 中 new / updated / merged / deduplicated。需跨候选合并且程序报歧义时，先人工语义复核解决冲突，不能通过换key逃过去重。

若状态里有 deferred_metadata，它只包含上次未发布的来源/别名合并。确认其base digest仍等于main才能作为合并参考；与main不一致则重新逐事件比对。不要把未经发布的版本当作已发布基准；真实实质更新时一并合并这些元数据。

## 4. 条件发布

- `material_changed=false`：不改 main、不刷新网页日期、不创建部署。若仅有转载来源或别名合并，将 `deferred-registry.json` 连同原始基准digest存到 radar-state，下次有真实更新时合入。只写任务检查记录。
- `material_changed=true`：检查 staged events/report/index，运行测试和渲染一致性检查，再将三份生成文件作为一个 main 提交。保留未涉及文件。提交前重新读取 main HEAD；若基准变化则重新合并、核验、去重。用 Git tree → commit → ref fast-forward 或标准Git提交；永不force覆盖。
- 提交前先把批次和候选输出保存到 radar-state 的运行目录，标记 prepared；不会导致网站发布。main提交后补记 commit SHA 和 expected content digest，便于中断恢复。
- main已连接到原Vercel项目。无需新建项目、购买服务、配置Vercel Cron或再次关联Git。state分支的vercel.json必须一直保留 `git.deploymentEnabled.radar-state=false`，严禁将状态分支合并回main。

## 5. 验证和成功时间

查询**该提交**的 GitHub combined status，Vercel应为success；再读取正式网址，比较完整HTML或 `main[data-content-digest]` 与 staging 预期。HTTP 200或插件“Action completed”不够。Vercel项目读取接口若不可见，可用已经成功的GitHub状态+正式站点内容验证；不需要索取用户Token或密码。

按 `lib/checkpoints.mjs` 的 `finalizeRun` 和 `scripts/finalize-run.mjs` 生成下一份状态。运行记录包括 id、base_state_digest、started_at、finished_at、material_changed、counts、publication、每个config来源的sources检查结果，以及实际补查完成与否。

- sources每项：id、status、note。`checked`/`not_applicable` 还必须给 window_start（不晚于该来源上次成功游标或首轮起点）、checked_through（本次实际覆盖到的时间）和 evidence 数组（url、note）。只检索到摘要记 public_search_only，不推进该来源已完整检查的时间。
- publication无变化时必须 `{ "status": "not_needed" }`。有变化时成功需要 status=verified、github_status=success、40位commit_sha、url为正式网址、64位expected_digest与observed_digest一致、verified_at真实时间。失败或未验证如实记录。
- 未验证发布：不推进任何成功游标，保留待发布批次；下次先恢复。
- 部分来源失败：全局 last_successful_run_at 不推进；已完成且无待发布失败的来源可单独推进，失败来源保留旧游标。
- 首轮只在确实覆盖bootstrap窗口后标记 backfill_complete。不能仅因今日运行结束就清除8月29、30日待补查记录。

在 radar-state 中原子提交 `state/checkpoint.json` 与 `state/runs/<run-id>/run.json`（以及待处理批次/元数据）。与main一样先读最新HEAD，禁止force。记录分支不部署，不会刷新正式网站。

## 6. 任务输出

网站展示约定（用户2026-08-31更新）：永久移除 DAILY BRIEFING / 分类摘要板块及指向它的入口；之后每次渲染和发布不得恢复。五类信息仍用于采集、事件分类筛选与任务文本，不删除事件或停用每日任务。网站保留重点变化、覆盖说明、事件档案及行动清单。仅改版式时不改新闻日期、增量数量或来源成功检查游标。

有实质变化：中文标准版，列最多3项重要变化、五类摘要、发布日期或发现时间、可靠来源、运营影响、执行建议和行动清单；说明新增、原卡片更新、来源合并、排除重复数量及发布验收结果。

完整检查且无实质变化：仅任务记录无新增，保持网页不动；遵从任务运行时静默输出规则。读取失败不是无新增；必要时报告缺失来源或发布阻塞。

不要配置、展示或执行任何钉钉推送。不要把Token、cookie、账号隐私或受限内容写入公开仓库。
