/**
 * Lightweight i18n system — no external dependencies.
 * Supports zh-CN (default) and en-US.
 */

export type Locale = 'zh' | 'en';

const STORAGE_KEY = 'polyrader-locale';

// ============================================================
// Translation dictionaries
// ============================================================

const zh: Record<string, string> = {
  // Common
  'common.refresh': '刷新',
  'common.loading': '加载中...',
  'common.noData': '暂无数据',
  'common.retry': '重试',
  'common.save': '保存',
  'common.cancel': '取消',
  'common.status': '状态',
  'common.market': '市场',
  'common.deviation': '偏差',
  'common.direction': '方向',
  'common.modelPrediction': '模型预测',
  'common.undervalued': '低估',
  'common.overvalued': '高估',
  'common.active': '活跃',
  'common.amount': '金额',

  // Navigation
  'nav.dashboard': '市场总览',
  'nav.daily': '每日看板',
  'nav.whales': '巨鲸追踪',
  'nav.esports': '赛事分析',
  'nav.signals': '信号对比',
  'nav.aiConfig': 'AI 配置',
  'nav.aiStats': 'AI 胜率',
  'nav.allocation': '资金分配',

  // Dashboard page
  'dashboard.title': '市场总览',
  'dashboard.subtitle': 'CS2 预测市场实时数据',
  'dashboard.activeMarkets': '活跃市场',
  'dashboard.volume24h': '24h 交易量',
  'dashboard.totalLiquidity': '总流动性',
  'dashboard.relatedMatches': '关联比赛',
  'dashboard.maxDeviation': '最大偏差信号',
  'dashboard.marketVsModel': '市场概率 vs 模型预测',
  'dashboard.liquidity': '流动性',
  'dashboard.price': '价格',

  // Whales page
  'whales.title': '巨鲸追踪',
  'whales.subtitle': '大额地址行为监控与可疑度分析',
  'whales.monitoredAddresses': '监控地址',
  'whales.highRiskAddresses': '高风险地址',
  'whales.totalVolume': '总交易量',
  'whales.leaderboard': '巨鲸排行榜',
  'whales.addressCount': '{count} 个地址',
  'whales.address': '地址',
  'whales.volume': '交易量',
  'whales.positions': '持仓数',
  'whales.winRate': '胜率',
  'whales.pnl': '盈亏',
  'whales.suspicious': '可疑度',

  // Address graph
  'addressGraph.title': '地址关联图谱',
  'addressGraph.subtitle': '巨鲸地址间的资金流转关系（买方 → 卖方）',
  'addressGraph.empty': '暂无关联数据。当巨鲸地址在同一市场产生买卖交互后将显示关联图谱。',
  'addressGraph.loading': '图谱加载中...',
  'addressGraph.nodeCount': '{count} 个节点',
  'addressGraph.linkCount': '{count} 条连接',
  'addressGraph.address': '地址',
  'addressGraph.volume': '交易量',
  'addressGraph.tradeCount': '交易次数',
  'addressGraph.legend.buyer': '买方',
  'addressGraph.legend.seller': '卖方',
  'addressGraph.legend.mixed': '混合',

  // Daily page
  'daily.title': '每日看板',
  'daily.subtitle': '今日比赛推荐与关注度分析',
  'daily.refreshAnalysis': '刷新分析',
  'daily.todayMatches': '今日比赛',
  'daily.highAttention': '高关注度',
  'daily.signalDeviation': '信号偏差',
  'daily.whaleActivity': '巨鲸异动',
  'daily.top3': 'TOP 3 推荐关注',
  'daily.attentionScore': '关注度 {score}%',
  'daily.allMatches': '全部比赛 ({count})',
  'daily.empty': '暂无比赛数据。每日看板将在 HLTV 数据拉取后自动生成。',
  'daily.match': '比赛',
  'daily.attention': '关注度',
  'daily.confidence': '置信度',
  'daily.recommendation': '推荐',
  'daily.high': '高',
  'daily.medium': '中',
  'daily.low': '低',

  // Esports page
  'esports.title': '赛事分析',
  'esports.subtitle': 'CS2 战队数据、排名与地图池分析',
  'esports.hltvTop10': 'HLTV 世界排名 TOP 10',
  'esports.rankingEmpty': '排名数据将在 HLTV 定时任务拉取后显示（每 6 小时更新）',
  'esports.team': '战队',
  'esports.rank': '排名',
  'esports.upcomingMatches': '即将到来的比赛 ({count})',
  'esports.matchesEmpty': '比赛数据将在 HLTV 定时任务拉取后显示（每 2 小时更新）',
  'esports.mapPool': '地图池对比',
  'esports.mapPoolEmpty': '地图池数据将在队伍数据拉取后显示',

  // Signals page
  'signals.title': '信号对比',
  'signals.subtitle': '多源预测信号对比与偏差分析',
  'signals.modelAccuracy': '模型准确率',
  'signals.totalPredictions': '总预测数',
  'signals.comparison': '多源信号对比',
  'signals.empty': '信号对比数据将在市场数据和模型预测就绪后自动生成',
  'signals.arbitrage': '套利',
  'signals.arbitrageOpportunity': '套利机会',

  // Price Alerts
  'alert.title': '价格告警',
  'alert.create': '创建告警',
  'alert.createTitle': '创建价格告警',
  'alert.selectMarket': '选择市场',
  'alert.selectMarketPlaceholder': '请选择市场...',
  'alert.type': '告警类型',
  'alert.typePriceAbove': '价格突破',
  'alert.typePriceBelow': '价格跌破',
  'alert.typeVolumeAbove': '成交量突破',
  'alert.threshold': '阈值',
  'alert.currentValue': '当前值',
  'alert.triggered': '已触发',
  'alert.monitoring': '监控中',
  'alert.action': '操作',
  'alert.empty': '暂无告警。点击"创建告警"添加价格/成交量监控。',

  // Arbitrage
  'arbitrage.title': '套利机会',
  'arbitrage.empty': '暂无套利机会',
  'arbitrage.type': '类型',
  'arbitrage.profitPct': '利润率',
  'arbitrage.details': '详情',
  'arbitrage.yesNoSpread': 'Yes/No 价差',
  'arbitrage.crossMarketSpread': '跨市场价差',

  // AI Stats page
  'aiStats.title': 'AI 胜率统计',
  'aiStats.subtitle': 'LLM 预测准确率、投注统计与置信度校准',
  'aiStats.totalBets': '总投注',
  'aiStats.winRate': '胜率',
  'aiStats.totalPnl': '总盈亏',
  'aiStats.bestLlm': '最佳 LLM',
  'aiStats.sharpeRatio': '夏普比率',
  'aiStats.maxDrawdown': '最大回撤',
  'aiStats.leaderboard': 'LLM 排行榜',
  'aiStats.empty': '暂无统计数据。运行 LLM 分析后数据将自动更新。',
  'aiStats.model': '模型',
  'aiStats.predictions': '预测数',
  'aiStats.correct': '正确数',
  'aiStats.accuracy': '准确率',
  'aiStats.avgConfidence': '平均置信度',
  'aiStats.calibrationError': '校准误差',
  'aiStats.calibrationCurve': '置信度校准曲线',
  'aiStats.recentBets': '最近投注',
  'aiStats.noBets': '暂无投注记录',
  'aiStats.settle': '结算',
  'aiStats.won': '胜',
  'aiStats.lost': '负',
  'aiStats.delete': '删除',
  'aiStats.confirmDelete': '确认删除？',
  'aiStats.reasoning': '决策理由',

  // Allocation page
  'allocation.title': 'AI 资金分配',
  'allocation.subtitle': '根据剩余资金与目标收益率，AI 智能分配下注金额',
  'allocation.totalCapital': '总资金',
  'allocation.availableCapital': '可用资金',
  'allocation.usedCapital': '已占用资金',
  'allocation.realizedPnl': '已实现盈亏',
  'allocation.targetProfit': '目标利润',
  'allocation.targetReturnRate': '目标收益率',
  'allocation.riskTolerance': '风险偏好',
  'allocation.risk.conservative': '保守',
  'allocation.risk.balanced': '平衡',
  'allocation.risk.aggressive': '激进',
  'allocation.configTitle': '资金配置',
  'allocation.edit': '编辑',
  'allocation.opportunities': '投注机会',
  'allocation.noOpportunities': '暂无投注机会，请添加比赛机会',
  'allocation.matchId': '比赛 ID',
  'allocation.team': '推荐方',
  'allocation.winProb': '胜率',
  'allocation.odds': '赔率',
  'allocation.confidence': '置信度',
  'allocation.add': '添加',
  'allocation.useLLM': 'AI 智能分配',
  'allocation.generate': '生成分配方案',
  'allocation.planResult': '分配方案',
  'allocation.noPlan': '点击"生成分配方案"获取 AI 推荐',
  'allocation.algorithmic': '算法',
  'allocation.totalAllocated': '总投注额',
  'allocation.expectedReturn': '预期收益',
  'allocation.expectedROI': '预期收益率',
  'allocation.portfolioRisk': '组合风险',
  'allocation.match': '比赛',
  'allocation.amount': '金额',
  'allocation.fraction': '占比',
  'allocation.expRet': '预期回报',
  'allocation.capitalUsage': '资金使用率',
  'allocation.history': '分配历史',
  'allocation.time': '时间',
  'allocation.source': '来源',
  'allocation.bets': '投注数',

  // Decision journal
  'journal.title': '决策记录',
  'journal.matchId': '比赛 ID',
  'journal.team': '投注队伍',
  'journal.amount': '金额',
  'journal.odds': '赔率',
  'journal.reasoning': '决策理由',
  'journal.submit': '记录决策',
  'journal.success': '决策已记录',
  'journal.invalidAmount': '金额需在 10-10000 之间',
  'journal.invalidOdds': '赔率需在 1.01-100 之间',
  'journal.requiredFields': '请填写必填字段',

  // AI Config page
  'aiConfig.title': 'AI 配置',
  'aiConfig.subtitle': '管理 LLM API Key、连通性测试与配额监控',
  'aiConfig.keyManagement': 'API Key 管理',
  'aiConfig.action': '操作',
  'aiConfig.empty': '暂无 LLM 配置。点击"配置"添加 API Key。',
  'aiConfig.configure': '配置',
  'aiConfig.test': '测试',
  'aiConfig.quotaUsage': '配额与用量',
  'aiConfig.noEnabledProvider': '暂无已启用的 LLM Provider',
  'aiConfig.failed': '失败',
  'aiConfig.connected': '已连接',
  'aiConfig.pendingTest': '待测试',
  'aiConfig.unconfigured': '未配置',

  // Prompt Variants page
  'promptVariants.title': 'Prompt 实验',
  'promptVariants.create': '创建变体',
  'promptVariants.name': '名称',
  'promptVariants.variantId': '变体 ID',
  'promptVariants.systemPrompt': 'System Prompt',
  'promptVariants.trafficWeight': '流量权重',
  'promptVariants.notes': '备注',
  'promptVariants.control': '对照组',
  'promptVariants.enabled': '已启用',
  'promptVariants.disabled': '已禁用',
  'promptVariants.edit': '编辑',
  'promptVariants.delete': '删除',
  'promptVariants.confirmDelete': '确认删除此变体？',
  'promptVariants.cannotDeleteControl': '无法删除对照组变体',
  'promptVariants.save': '保存',
  'promptVariants.cancel': '取消',

  // A/B Comparison
  'abCompare.title': 'A/B 对比',
  'abCompare.variantA': '变体 A',
  'abCompare.variantB': '变体 B',
  'abCompare.compare': '对比',
  'abCompare.totalAnalyses': '总分析数',
  'abCompare.totalBets': '总投注',
  'abCompare.won': '胜',
  'abCompare.lost': '负',
  'abCompare.pending': '待结算',
  'abCompare.profitLoss': '盈亏',
  'abCompare.roi': 'ROI',
  'abCompare.accuracy': '准确率',
  'abCompare.selectVariant': '选择变体',
  'abCompare.significant': '统计显著 (p<0.05)',
  'abCompare.pValue': 'P 值',
  'abCompare.zScore': 'Z 分数',
  'abCompare.chiSquare': '卡方',
  'abCompare.bayesProbA': '贝叶斯 P(A 更优)',
  'abCompare.bayesProbB': 'P(B 更优)',
  'abCompare.insufficientData': '样本不足（需 {min} 组已结算投注，当前 A={a} B={b}）',
  'abCompare.recommendation.promote_variant_a': '建议提升变体 A',
  'abCompare.recommendation.promote_variant_b': '建议提升变体 B',
  'abCompare.recommendation.insufficient_data': '数据不足，无法给出建议',
  'abCompare.recommendation.no_significant_difference': '无显著差异',

  // Match detail page
  'match.strongConsensus': '强一致',
  'match.mediumConsensus': '中等一致',
  'match.weakConsensus': '弱一致',
  'match.disagreement': '分歧',
  'match.notFound': '比赛数据未找到',
  'match.waitForHltv': '请等待 HLTV 数据拉取完成后重试',
  'match.analysis': '比赛分析',
  'match.analyzing': '分析中...',
  'match.triggerAnalysis': '触发 LLM 分析',
  'match.aggregateProbability': '聚合胜率预测',
  'match.lineupComparison': '出场阵容对比',
  'match.lineupConfirmed': '阵容已确认',
  'match.lineupPending': '阵容待确认',
  'match.lineup': '{name} 阵容',
  'match.withSubstitute': '含替补',
  'match.substitute': '替补',
  'match.avgRating': '均分:',
  'match.impact': '冲击力:',
  'match.lineupEmpty': '阵容数据将在 HLTV 定时任务拉取后显示（每 2 小时更新）',
  'match.substituteWarning': '{name} 有替补选手，阵容默契度可能下降。',
  'match.factorBreakdown': '6 维因子分解',
  'match.factor.form': '状态',
  'match.factor.lineup': '阵容',
  'match.factor.map': '地图',
  'match.factor.h2h': '交锋',
  'match.factor.momentum': '情绪',
  'match.factor.hltvRank': 'HLTV 排名',
  'match.factor.recentForm': '近期状态',
  'match.factor.lineupStrength': '出场阵容',
  'match.factor.mapPool': '地图池',
  'match.factor.h2hRecord': '历史交锋',
  'match.factor.marketSentiment': '市场情绪',
  'match.weight': '权重 {weight}%',
  'match.factorEmpty': '触发 LLM 分析后显示因子分解',
  'match.llmConsensus': 'LLM 共识分析',
  'match.llmEmpty': '点击"触发 LLM 分析"让多个 AI 模型同时分析本场比赛',
  'match.confidence': '% 置信',
  'match.consensus': '共识:',
  'match.consensusLabel': '一致',
  'match.modelRecommendation': '模型推荐',
  'match.draw': '平局',
  'match.kellyAllocation': 'Kelly 资金分配',
  'match.kellyRatio': 'Kelly 比例',
  'match.capitalRatio': '资金占比',
  'match.allocate': '{name} 分配',
  'match.analyzingOrNoConsensus': 'LLM 共识不足，不建议投注',
  'match.priceTrend': '价格走势',
  'match.noPriceData': '暂无价格数据',
  'match.orderBookDepth': '订单簿深度',
  'match.noOrderBookData': '暂无订单簿数据',
  'match.yourDecision': '你的决策',
  'match.decisionHint': '基于 LLM 分析结果确认或调整',
  'match.betConfirmed': '已确认投注',
  'match.bet': '投注 {name}',
  'match.skip': '跳过',

  // Setup page
  'setup.failed': '设置失败',
  'setup.appTitle': 'Polymarket CS2 电竞预测分析工具',
  'setup.firstSetup': '首次设置',
  'setup.description': '选择数据存储位置。所有数据（数据库、配置文件、缓存）将存储在此文件夹中。',
  'setup.dataFolder': '数据存储文件夹',
  'setup.selectFolderPlaceholder': '点击右侧按钮选择...',
  'setup.selectFolderButton': '选择文件夹...',
  'setup.select': '选择',
  'setup.initializing': '正在初始化...',
  'setup.start': '开始使用',
  'setup.browserMode': '浏览器模式：数据将存储在项目 data/ 目录',
  'setup.tagline': '无需注册 · 无需登录 · 完全开源',

  // Not found
  'notFound.title': '页面未找到',
  'notFound.description': '您访问的页面不存在或已被移除',
  'notFound.backHome': '返回首页',

  // Error boundary
  'error.title': '出了点问题',
  'error.unknown': '未知错误',
  'error.reloadPage': '重新加载页面',
  'error.viewDetails': '查看错误详情',

  // Settlement
  'settlement.completed': '✓ 结算完成: {question} → {outcome}{pnl}',

  // App
  'app.starting': '正在启动...',
  'app.startingBackend': '正在启动后端服务...',

  // Calibration chart
  'calibration.empty': '暂无校准数据',
  'calibration.curve': '{provider} 校准曲线',
  'calibration.actualAccuracy': '实际准确率',
  'calibration.sampleCount': '样本数',
  'calibration.perfect': '完美校准',

  // Order book
  'orderBook.depth': '订单簿深度',

  // Tauri bridge
  'tauri.selectDataFolder': '选择数据存储文件夹',

  // Language switcher
  'lang.switch': '语言',
  'lang.zh': '中文',
  'lang.en': 'English',
};

const en: Record<string, string> = {
  // Common
  'common.refresh': 'Refresh',
  'common.loading': 'Loading...',
  'common.noData': 'No data',
  'common.retry': 'Retry',
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.status': 'Status',
  'common.market': 'Market',
  'common.deviation': 'Deviation',
  'common.direction': 'Direction',
  'common.modelPrediction': 'Model Prediction',
  'common.undervalued': 'Undervalued',
  'common.overvalued': 'Overvalued',
  'common.active': 'Active',
  'common.amount': 'Amount',

  // Navigation
  'nav.dashboard': 'Dashboard',
  'nav.daily': 'Daily',
  'nav.whales': 'Whales',
  'nav.esports': 'Esports',
  'nav.signals': 'Signals',
  'nav.aiConfig': 'AI Config',
  'nav.aiStats': 'AI Stats',
  'nav.promptVariants': 'Prompt A/B',
  'nav.allocation': 'Allocation',

  // Dashboard page
  'dashboard.title': 'Dashboard',
  'dashboard.subtitle': 'CS2 prediction market real-time data',
  'dashboard.activeMarkets': 'Active Markets',
  'dashboard.volume24h': '24h Volume',
  'dashboard.totalLiquidity': 'Total Liquidity',
  'dashboard.relatedMatches': 'Related Matches',
  'dashboard.maxDeviation': 'Max Deviation Signals',
  'dashboard.marketVsModel': 'Market probability vs Model prediction',
  'dashboard.liquidity': 'Liquidity',
  'dashboard.price': 'Price',

  // Connection status
  'connectionStatus.connected': 'Connected',
  'connectionStatus.connecting': 'Connecting',
  'connectionStatus.disconnected': 'Disconnected·Reconnecting',

  // Market heatmap
  'heatmap.title': 'Market Heatmap',
  'heatmap.subtitle': 'Market activity by tournament tier and volume',
  'heatmap.price': 'Price',
  'heatmap.volume24h': '24h Volume',
  'heatmap.markets': 'markets',
  'heatmap.tier.S': 'S-Tier',
  'heatmap.tier.A': 'A-Tier',
  'heatmap.tier.B': 'B-Tier',
  'heatmap.tier.Tier': 'Tier',
  'heatmap.empty': 'No market data',

  // Whales page
  'whales.title': 'Whale Tracking',
  'whales.subtitle': 'Large address behavior monitoring and suspicious activity analysis',
  'whales.monitoredAddresses': 'Monitored Addresses',
  'whales.highRiskAddresses': 'High-Risk Addresses',
  'whales.totalVolume': 'Total Volume',
  'whales.leaderboard': 'Whale Leaderboard',
  'whales.addressCount': '{count} addresses',
  'whales.address': 'Address',
  'whales.volume': 'Volume',
  'whales.positions': 'Positions',
  'whales.winRate': 'Win Rate',
  'whales.pnl': 'PnL',
  'whales.suspicious': 'Suspicious',

  // Address graph
  'addressGraph.title': 'Address Association Graph',
  'addressGraph.subtitle': 'Fund flow relationships between whale addresses (buyer → seller)',
  'addressGraph.empty': 'No association data. The graph will appear once whale addresses interact on the same market.',
  'addressGraph.loading': 'Loading graph...',
  'addressGraph.nodeCount': '{count} nodes',
  'addressGraph.linkCount': '{count} links',
  'addressGraph.address': 'Address',
  'addressGraph.volume': 'Volume',
  'addressGraph.tradeCount': 'Trades',
  'addressGraph.legend.buyer': 'Buyer',
  'addressGraph.legend.seller': 'Seller',
  'addressGraph.legend.mixed': 'Mixed',

  // Daily page
  'daily.title': 'Daily Dashboard',
  'daily.subtitle': 'Today match recommendations and attention analysis',
  'daily.refreshAnalysis': 'Refresh Analysis',
  'daily.todayMatches': 'Today Matches',
  'daily.highAttention': 'High Attention',
  'daily.signalDeviation': 'Signal Deviation',
  'daily.whaleActivity': 'Whale Activity',
  'daily.top3': 'TOP 3 Recommendations',
  'daily.attentionScore': 'Attention {score}%',
  'daily.allMatches': 'All Matches ({count})',
  'daily.empty': 'No match data. Daily dashboard will be generated after HLTV data is fetched.',
  'daily.match': 'Match',
  'daily.attention': 'Attention',
  'daily.confidence': 'Confidence',
  'daily.recommendation': 'Recommendation',
  'daily.high': 'High',
  'daily.medium': 'Medium',
  'daily.low': 'Low',

  // Esports page
  'esports.title': 'Esports Analysis',
  'esports.subtitle': 'CS2 team data, rankings and map pool analysis',
  'esports.hltvTop10': 'HLTV World Ranking TOP 10',
  'esports.rankingEmpty': 'Ranking data will appear after HLTV cron job runs (updates every 6 hours)',
  'esports.team': 'Team',
  'esports.rank': 'Rank',
  'esports.upcomingMatches': 'Upcoming Matches ({count})',
  'esports.matchesEmpty': 'Match data will appear after HLTV cron job runs (updates every 2 hours)',
  'esports.mapPool': 'Map Pool Comparison',
  'esports.mapPoolEmpty': 'Map pool data will appear after team data is fetched',

  // Signals page
  'signals.title': 'Signal Comparison',
  'signals.subtitle': 'Multi-source prediction signal comparison and deviation analysis',
  'signals.modelAccuracy': 'Model Accuracy',
  'signals.totalPredictions': 'Total Predictions',
  'signals.comparison': 'Multi-Source Signal Comparison',
  'signals.empty': 'Signal comparison data will be generated when market data and model predictions are ready',
  'signals.arbitrage': 'Arb',
  'signals.arbitrageOpportunity': 'Arbitrage Opportunity',

  // Price Alerts
  'alert.title': 'Price Alerts',
  'alert.create': 'Create Alert',
  'alert.createTitle': 'Create Price Alert',
  'alert.selectMarket': 'Select Market',
  'alert.selectMarketPlaceholder': 'Select a market...',
  'alert.type': 'Alert Type',
  'alert.typePriceAbove': 'Price Above',
  'alert.typePriceBelow': 'Price Below',
  'alert.typeVolumeAbove': 'Volume Above',
  'alert.threshold': 'Threshold',
  'alert.currentValue': 'Current Value',
  'alert.triggered': 'Triggered',
  'alert.monitoring': 'Monitoring',
  'alert.action': 'Action',
  'alert.empty': 'No alerts. Click "Create Alert" to add price/volume monitoring.',

  // Arbitrage
  'arbitrage.title': 'Arbitrage Opportunities',
  'arbitrage.empty': 'No arbitrage opportunities',
  'arbitrage.type': 'Type',
  'arbitrage.profitPct': 'Profit %',
  'arbitrage.details': 'Details',
  'arbitrage.yesNoSpread': 'Yes/No Spread',
  'arbitrage.crossMarketSpread': 'Cross-Market Spread',

  // AI Stats page
  'aiStats.title': 'AI Win Rate Stats',
  'aiStats.subtitle': 'LLM prediction accuracy, betting statistics and confidence calibration',
  'aiStats.totalBets': 'Total Bets',
  'aiStats.winRate': 'Win Rate',
  'aiStats.totalPnl': 'Total PnL',
  'aiStats.bestLlm': 'Best LLM',
  'aiStats.sharpeRatio': 'Sharpe Ratio',
  'aiStats.maxDrawdown': 'Max Drawdown',
  'aiStats.leaderboard': 'LLM Leaderboard',
  'aiStats.empty': 'No stats data. Run LLM analysis to automatically update.',
  'aiStats.model': 'Model',
  'aiStats.predictions': 'Predictions',
  'aiStats.correct': 'Correct',
  'aiStats.accuracy': 'Accuracy',
  'aiStats.avgConfidence': 'Avg Confidence',
  'aiStats.calibrationError': 'Calibration Error',
  'aiStats.pnl': 'PnL',
  'aiStats.calibrationCurve': 'Confidence Calibration Curve',
  'aiStats.recentBets': 'Recent Bets',
  'aiStats.noBets': 'No bet records',
  'aiStats.settle': 'Settle',
  'aiStats.won': 'Won',
  'aiStats.lost': 'Lost',
  'aiStats.delete': 'Delete',
  'aiStats.confirmDelete': 'Confirm delete?',
  'aiStats.reasoning': 'Reasoning',

  // Allocation page
  'allocation.title': 'AI Bet Allocation',
  'allocation.subtitle': 'AI allocates bet amounts based on remaining capital and target return rate',
  'allocation.totalCapital': 'Total Capital',
  'allocation.availableCapital': 'Available Capital',
  'allocation.usedCapital': 'Used Capital',
  'allocation.realizedPnl': 'Realized PnL',
  'allocation.targetProfit': 'Target Profit',
  'allocation.targetReturnRate': 'Target Return Rate',
  'allocation.riskTolerance': 'Risk Tolerance',
  'allocation.risk.conservative': 'Conservative',
  'allocation.risk.balanced': 'Balanced',
  'allocation.risk.aggressive': 'Aggressive',
  'allocation.configTitle': 'Bankroll Config',
  'allocation.edit': 'Edit',
  'allocation.opportunities': 'Opportunities',
  'allocation.noOpportunities': 'No opportunities added yet',
  'allocation.matchId': 'Match ID',
  'allocation.team': 'Team',
  'allocation.winProb': 'Win %',
  'allocation.odds': 'Odds',
  'allocation.confidence': 'Confidence',
  'allocation.add': 'Add',
  'allocation.useLLM': 'AI-driven allocation',
  'allocation.generate': 'Generate Plan',
  'allocation.planResult': 'Allocation Plan',
  'allocation.noPlan': 'Click "Generate Plan" to get AI recommendation',
  'allocation.algorithmic': 'Algo',
  'allocation.totalAllocated': 'Total Allocated',
  'allocation.expectedReturn': 'Expected Return',
  'allocation.expectedROI': 'Expected ROI',
  'allocation.portfolioRisk': 'Portfolio Risk',
  'allocation.match': 'Match',
  'allocation.amount': 'Amount',
  'allocation.fraction': 'Fraction',
  'allocation.expRet': 'Exp. Return',
  'allocation.capitalUsage': 'Capital Usage',
  'allocation.history': 'Allocation History',
  'allocation.time': 'Time',
  'allocation.source': 'Source',
  'allocation.bets': 'Bets',

  // AI Config page
  'aiConfig.title': 'AI Config',
  'aiConfig.subtitle': 'Manage LLM API keys, connectivity tests and quota monitoring',
  'aiConfig.keyManagement': 'API Key Management',
  'aiConfig.action': 'Action',
  'aiConfig.empty': 'No LLM configured. Click "Configure" to add an API key.',
  'aiConfig.configure': 'Configure',
  'aiConfig.test': 'Test',
  'aiConfig.quotaUsage': 'Quota & Usage',
  'aiConfig.noEnabledProvider': 'No enabled LLM provider',
  'aiConfig.failed': 'Failed',
  'aiConfig.connected': 'Connected',
  'aiConfig.pendingTest': 'Pending Test',
  'aiConfig.unconfigured': 'Unconfigured',

  // Prompt Variants page
  'promptVariants.title': 'Prompt Experiments',
  'promptVariants.create': 'Create Variant',
  'promptVariants.name': 'Name',
  'promptVariants.variantId': 'Variant ID',
  'promptVariants.systemPrompt': 'System Prompt',
  'promptVariants.trafficWeight': 'Traffic Weight',
  'promptVariants.notes': 'Notes',
  'promptVariants.control': 'Control',
  'promptVariants.enabled': 'Enabled',
  'promptVariants.disabled': 'Disabled',
  'promptVariants.edit': 'Edit',
  'promptVariants.delete': 'Delete',
  'promptVariants.confirmDelete': 'Delete this variant?',
  'promptVariants.cannotDeleteControl': 'Cannot delete control variant',
  'promptVariants.save': 'Save',
  'promptVariants.cancel': 'Cancel',

  // A/B Comparison
  'abCompare.title': 'A/B Comparison',
  'abCompare.variantA': 'Variant A',
  'abCompare.variantB': 'Variant B',
  'abCompare.compare': 'Compare',
  'abCompare.totalAnalyses': 'Total Analyses',
  'abCompare.totalBets': 'Total Bets',
  'abCompare.won': 'Won',
  'abCompare.lost': 'Lost',
  'abCompare.pending': 'Pending',
  'abCompare.profitLoss': 'PnL',
  'abCompare.roi': 'ROI',
  'abCompare.accuracy': 'Accuracy',
  'abCompare.selectVariant': 'Select variant',
  'abCompare.significant': 'Statistically significant (p<0.05)',
  'abCompare.pValue': 'P-value',
  'abCompare.zScore': 'Z-score',
  'abCompare.insufficientData': 'Insufficient data (need {min} settled bets, current A={a} B={b})',
  'abCompare.chiSquare': 'Chi-Square',
  'abCompare.bayesProbA': 'Bayesian P(A better)',
  'abCompare.bayesProbB': 'P(B better)',
  'abCompare.recommendation.promote_variant_a': 'Recommend: Promote Variant A',
  'abCompare.recommendation.promote_variant_b': 'Recommend: Promote Variant B',
  'abCompare.recommendation.insufficient_data': 'Insufficient data for recommendation',
  'abCompare.recommendation.no_significant_difference': 'No significant difference',

  // Decision Journal
  'journal.title': 'Decision Journal',
  'journal.matchId': 'Match ID',
  'journal.team': 'Team',
  'journal.amount': 'Amount',
  'journal.odds': 'Odds',
  'journal.reasoning': 'Reasoning',
  'journal.submit': 'Record Decision',
  'journal.success': 'Decision recorded',
  'journal.invalidAmount': 'Amount must be between 10 and 10000',
  'journal.invalidOdds': 'Odds must be between 1.01 and 100',
  'journal.requiredFields': 'Please fill in required fields',

  // Match detail page
  'match.strongConsensus': 'Strong Consensus',
  'match.mediumConsensus': 'Medium Consensus',
  'match.weakConsensus': 'Weak Consensus',
  'match.disagreement': 'Disagreement',
  'match.notFound': 'Match data not found',
  'match.waitForHltv': 'Please wait for HLTV data to be fetched and try again',
  'match.analysis': 'Match Analysis',
  'match.analyzing': 'Analyzing...',
  'match.triggerAnalysis': 'Trigger LLM Analysis',
  'match.aggregateProbability': 'Aggregate Win Probability',
  'match.lineupComparison': 'Lineup Comparison',
  'match.lineupConfirmed': 'Lineup Confirmed',
  'match.lineupPending': 'Lineup Pending',
  'match.lineup': '{name} Lineup',
  'match.withSubstitute': 'w/ Sub',
  'match.substitute': 'Sub',
  'match.avgRating': 'Avg:',
  'match.impact': 'Impact:',
  'match.lineupEmpty': 'Lineup data will appear after HLTV cron job runs (updates every 2 hours)',
  'match.substituteWarning': '{name} has substitute players, lineup synergy may decrease.',
  'match.factorBreakdown': '6-Factor Breakdown',
  'match.factor.form': 'Form',
  'match.factor.lineup': 'Lineup',
  'match.factor.map': 'Map',
  'match.factor.h2h': 'H2H',
  'match.factor.momentum': 'Momentum',
  'match.factor.hltvRank': 'HLTV Rank',
  'match.factor.recentForm': 'Recent Form',
  'match.factor.lineupStrength': 'Lineup Strength',
  'match.factor.mapPool': 'Map Pool',
  'match.factor.h2hRecord': 'H2H Record',
  'match.factor.marketSentiment': 'Market Sentiment',
  'match.weight': 'Weight {weight}%',
  'match.factorEmpty': 'Trigger LLM analysis to see factor breakdown',
  'match.llmConsensus': 'LLM Consensus Analysis',
  'match.llmEmpty': 'Click "Trigger LLM Analysis" to have multiple AI models analyze this match',
  'match.confidence': '% Confidence',
  'match.consensus': 'Consensus:',
  'match.consensusLabel': 'Agreement',
  'match.modelRecommendation': 'model recommendation',
  'match.draw': 'Draw',
  'match.kellyAllocation': 'Kelly Capital Allocation',
  'match.kellyRatio': 'Kelly Ratio',
  'match.capitalRatio': 'Capital Ratio',
  'match.allocate': '{name} Allocation',
  'match.analyzingOrNoConsensus': 'LLM consensus insufficient, betting not recommended',
  'match.priceTrend': 'Price Trend',
  'match.noPriceData': 'No price data',
  'match.orderBookDepth': 'Order Book Depth',
  'match.noOrderBookData': 'No order book data',
  'match.yourDecision': 'Your Decision',
  'match.decisionHint': 'Confirm or adjust based on LLM analysis results',
  'match.betConfirmed': 'Bet Confirmed',
  'match.bet': 'Bet {name}',
  'match.skip': 'Skip',

  // Setup page
  'setup.failed': 'Setup Failed',
  'setup.appTitle': 'Polymarket CS2 Esports Prediction Analysis Tool',
  'setup.firstSetup': 'First Setup',
  'setup.description': 'Select data storage location. All data (database, config, cache) will be stored in this folder.',
  'setup.dataFolder': 'Data Storage Folder',
  'setup.selectFolderPlaceholder': 'Click the button to select...',
  'setup.selectFolderButton': 'Select Folder...',
  'setup.select': 'Select',
  'setup.initializing': 'Initializing...',
  'setup.start': 'Get Started',
  'setup.browserMode': 'Browser mode: Data will be stored in project data/ directory',
  'setup.tagline': 'No registration · No login · Fully open source',

  // Not found
  'notFound.title': 'Page Not Found',
  'notFound.description': 'The page you are looking for does not exist or has been removed',
  'notFound.backHome': 'Back to Home',

  // Error boundary
  'error.title': 'Something went wrong',
  'error.unknown': 'Unknown error',
  'error.reloadPage': 'Reload Page',
  'error.viewDetails': 'View Error Details',

  // Settlement
  'settlement.completed': '✓ Settlement completed: {question} → {outcome}{pnl}',

  // App
  'app.starting': 'Starting...',
  'app.startingBackend': 'Starting backend service...',

  // Calibration chart
  'calibration.empty': 'No calibration data',
  'calibration.curve': '{provider} Calibration Curve',
  'calibration.actualAccuracy': 'Actual Accuracy',
  'calibration.sampleCount': 'Sample Count',
  'calibration.perfect': 'Perfect Calibration',

  // Order book
  'orderBook.depth': 'Order Book Depth',

  // Tauri bridge
  'tauri.selectDataFolder': 'Select Data Storage Folder',

  // Language switcher
  'lang.switch': 'Language',
  'lang.zh': '中文',
  'lang.en': 'English',
};

const dictionaries: Record<Locale, Record<string, string>> = { zh, en };

// ============================================================
// State management
// ============================================================

let currentLocale: Locale = (() => {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (stored === 'zh' || stored === 'en') return stored;
  }
  return 'zh';
})();

const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  if (locale === currentLocale) return;
  currentLocale = locale;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, locale);
  }
  listeners.forEach((fn) => fn());
}

export function subscribeLocale(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ============================================================
// Translation function
// ============================================================

export function t(key: string, params?: Record<string, string | number>): string {
  const dict = dictionaries[currentLocale] ?? dictionaries.zh;
  let value = dict[key] ?? dictionaries.zh[key] ?? key;

  if (params) {
    for (const [param, replacement] of Object.entries(params)) {
      value = value.replace(`{${param}}`, String(replacement));
    }
  }

  return value;
}
