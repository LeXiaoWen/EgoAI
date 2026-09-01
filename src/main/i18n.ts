/**
 * Lightweight i18n module for the Electron main process.
 *
 * Mirrors the renderer's i18nService pattern but runs in Node (no DOM/window).
 * Keeps only the small subset of keys needed by main-process code
 * (tray menu, session titles, etc.).
 *
 * Usage:
 *   import { t, setLanguage } from './i18n';
 *   setLanguage('en');
 *   const label = t('trayShowWindow'); // "Open EgoAI"
 *   const msg = t('imMissingCredentials', { fields: 'appId, appSecret' });
 */

export type LanguageType = 'zh' | 'en';

const translations: Record<LanguageType, Record<string, string>> = {
  zh: {
    // DeepSeek Harness (experimental)
    dshWorkbenchTitle: 'DeepSeek Harness 工作台（实验）',
    trayShowWindow: '打开 EgoAI',
    trayNewTask: '新建任务',
    trayViewCompletedTask: '查看完成的任务',
    trayCompletedTaskTooltip: 'EgoAI - {count} 个任务已完成',
    traySettings: '设置',
    trayQuit: '退出',
    taskCompletionNotificationTitle: '任务已完成',
    taskCompletionNotificationBody: '有任务已完成，点击查看结果',
    taskCompletionOverlayDescription: '有任务已完成',
    permissionNotificationTitle: '等待你的确认',
    permissionNotificationBody: 'Agent 请求执行 {toolName}，等待你的确认',
    permissionNotificationBodyGeneric: 'Agent 请求执行操作，等待你的确认',
    questionNotificationTitle: '等待你的回答',
    questionNotificationBody: '需要你回答问题后才能继续',
    contextMenuCut: '剪切',
    contextMenuCopy: '复制',
    contextMenuPaste: '粘贴',
    contextMenuSelectAll: '全选',

    // Session titles (created by ChannelSessionSync)
    coworkDefaultSessionTitle: '新对话',
    taskTimedOut: '[任务超时] 任务因超过最大允许时长而被自动停止。你可以继续对话以从中断处继续。',
    taskThinkingOnly:
      '[模型未输出内容] 模型已完成思考但未生成可见回复。你可以继续对话，让模型重新输出结果。',
    taskOutputTruncated:
      '[输出未完成] 模型已达到本次输出长度上限。部分结果已保留，但任务未确认完成；你可以继续对话以从中断处继续。',

    // Feishu bot install
    coworkErrorAuthInvalid: 'API 密钥无效或已过期，请检查配置。',
    coworkErrorOAuthInvalid: 'OAuth 授权已失效或权限不足，请重新授权后重试。',
    coworkErrorModelAccessDenied: '当前凭据无权访问该模型，请切换模型或检查模型服务商配置。',
    coworkErrorQuotaExhausted: '模型服务配额已用完，请检查模型服务商配额设置或稍后重试。',
    coworkErrorInsufficientBalance: 'API 余额不足，请检查模型服务商账户后重试。',
    coworkErrorInputTooLong: '输入内容过长，超出模型上下文限制。',
    coworkErrorMessageTooLarge:
      '本次消息过大，请减少附件、压缩图片或拆分提交。（单次整体需小于 30MB）',
    coworkErrorCouldNotProcessPdf: '无法处理 PDF 文件。',
    coworkErrorModelNotFound: '请求的模型不存在或不可用。',
    coworkGatewaySessionSyncTimeout: 'OpenClaw 引擎响应缓慢，消息尚未发送。请等待 1~2 分钟后重新发送；若频繁出现，请检查系统内存与磁盘占用，并将 EgoAI 加入杀毒软件白名单。',
    coworkErrorTranscriptOversized: '该任务的历史记录过大。为保护 AI 引擎，本次消息未发送；请新建任务继续，原任务记录仍会保留。',
    coworkErrorGatewayHeapOutOfMemory: '本地 AI 引擎内存不足并已自动重启。当前任务可能过大，请等待恢复后在新任务中继续。',
    coworkErrorGatewayDisconnected: 'AI 引擎连接中断，请重试。',
    coworkErrorServiceRestart: 'AI 引擎正在重启，请稍后重试。',
    coworkErrorGatewayDraining: 'AI 引擎正在重启中，请稍等片刻后重试。',
    openClawConfigApplyPending: 'OpenClaw 正在应用配置，请稍后重试。',
    openClawConfigApplyOverdue:
      'OpenClaw 正在等待活动任务结束后应用配置。请完成或停止活动任务，然后重试。',
    coworkErrorModelResponseTimeout: '模型响应超时，请稍后重试。',
    coworkErrorNetworkError: '网络连接失败，请检查网络设置。',
    coworkErrorRateLimit: '请求过于频繁，请稍后再试。',
    coworkErrorModelOverloaded: '模型服务当前繁忙或容量不足，请稍后重试。',
    coworkErrorContentFiltered: '内容未通过安全审核，请修改后重试。',
    coworkErrorToolLoopBlocked:
      '检测到 AI 在重复执行同一个工具调用且没有新的进展（通常是在等待一个耗时较长的后台任务），本轮已被安全停止。后台任务可能仍在运行，可以继续发消息让 AI 接着处理。',
    coworkErrorServerError: '服务端出现错误，请稍后重试。',
    coworkErrorEngineNotReady: 'AI 引擎正在启动中，请稍等几秒后重试。',
    coworkErrorModelStreamEmptySseData:
      '模型流式响应格式异常：模型服务返回了空的 SSE data 帧。请稍后重试，或检查当前模型代理配置。',
    coworkErrorModelStreamOnlyEmptySseData:
      '模型流式响应一直为空：模型服务连续返回空的 SSE data 帧。请稍后重试，或检查当前模型代理配置。',
    coworkErrorUnknown: '任务执行出错，请重试。如果问题持续出现，请检查模型配置。',
    coworkBtwDisconnected: 'AI 引擎连接中断，顺便问问未能完成。',
    coworkBtwTimeout: '顺便问问等待回答超时，请重试。',
    coworkBtwInvalidResult: 'AI 引擎返回了无效的顺便问问结果。',
    coworkBtwFailed: '顺便问问回答失败，请重试。',
    coworkBtwRequestRequired: '会话、运行标识和问题不能为空。',
    coworkBtwInvalidIdentifier: '顺便问问的会话或运行标识无效。',
    coworkBtwQuestionRequired: '请输入顺便问问的问题。',
    coworkBtwSingleLine: '顺便问问暂时只支持单行问题。',
    coworkBtwResultTruncated: '（回答过长，已截断）',
    coworkBtwAlreadyPending: '当前对话已有一个正在回答的顺便问问。',
    coworkBtwRunConflict: '顺便问问的运行标识与现有任务冲突。',
    coworkBtwSessionNotFound: '找不到会话 {sessionId}。',
    coworkBtwUnavailable: '当前运行时暂不支持顺便问问。',
    coworkBtwSubmitFailed: '提交顺便问问失败。',
    coworkBtwNoPending: '找不到正在回答的顺便问问。',
    coworkBtwStopFailed: '停止顺便问问失败，请重试。',
    execApprovalApproved: '用户已确认执行该命令，请检查执行结果并继续。',
    execApprovalDenied: '用户已拒绝执行该命令。',

    // Skill manager errors
    skillErrNoSkillMd: '来源中未找到 SKILL.md',
    skillErrInvalidSource:
      '无效的技能来源。支持 owner/repo、仓库链接、npm 包名、ClawHub 链接或 GitHub tree/blob 链接。',
    skillErrClawhubNotFound: '在 ClawHub 上未找到该技能，请检查链接是否正确。',
    skillErrClawhubDownloadFailed: '从 ClawHub 下载技能失败，请稍后重试。',

    // Auth quota
    dataMigrationBackupDialogTitle: '备份 EgoAI 数据',
    dataMigrationRestoreDialogTitle: '导入 EgoAI 数据备份',
    dataMigrationBackupArchiveFilter: 'EgoAI 备份包',
    dataMigrationAllFilesFilter: '所有文件',
    dataMigrationBackupBlockedByActiveWorkloads:
      '当前有正在运行的 Agent 或定时任务，请停止或等待任务完成后再备份。',
    dataMigrationRestoreProgressTitle: '正在导入 EgoAI 数据',
    dataMigrationRestoreProgressDesc: '正在恢复备份并校验数据，完成后应用会自动重启。',
    dataMigrationRestoreProgressWarning: '请不要关闭应用或重启电脑，否则可能中断本次数据迁移。',

    // ── IM connectivity test messages ───────────────────────────────────
    // Common
    getApiKey: '获取 API Key',
    testConnection: '测试连接',
  },
  en: {
    // DeepSeek Harness (experimental)
    dshWorkbenchTitle: 'DeepSeek Harness Workbench (Experimental)',
    trayShowWindow: 'Open EgoAI',
    trayNewTask: 'New Task',
    trayViewCompletedTask: 'View Completed Task',
    trayCompletedTaskTooltip: 'EgoAI - {count} completed task(s)',
    traySettings: 'Settings',
    trayQuit: 'Quit',
    taskCompletionNotificationTitle: 'Task Complete',
    taskCompletionNotificationBody: 'A task has finished. Click to view the result.',
    taskCompletionOverlayDescription: 'Task complete',
    permissionNotificationTitle: 'Waiting for Your Confirmation',
    permissionNotificationBody: 'The agent requests to run {toolName} and is waiting for your confirmation.',
    permissionNotificationBodyGeneric: 'The agent requests to run an action and is waiting for your confirmation.',
    questionNotificationTitle: 'Waiting for Your Answer',
    questionNotificationBody: 'Waiting for your answer to continue.',
    contextMenuCut: 'Cut',
    contextMenuCopy: 'Copy',
    contextMenuPaste: 'Paste',
    contextMenuSelectAll: 'Select All',

    // Session titles
    coworkDefaultSessionTitle: 'New Chat',
    taskTimedOut:
      '[Task timed out] The task was automatically stopped because it exceeded the maximum allowed duration. You can continue the conversation to pick up where it left off.',
    taskThinkingOnly:
      '[No output] The model finished thinking but did not generate a visible reply. You can continue the conversation to ask it to output the result.',
    taskOutputTruncated:
      '[Output incomplete] The model reached the output limit for this response. The partial result was preserved, but the task is not confirmed complete. Continue the conversation to resume.',

    // Feishu bot install
    coworkErrorAuthInvalid: 'Invalid or expired API key. Please check your configuration.',
    coworkErrorOAuthInvalid: 'OAuth authorization is invalid or missing required access. Re-authenticate and try again.',
    coworkErrorModelAccessDenied: 'Your current credentials are not allowed to access the selected model. Switch models or check the model provider configuration.',
    coworkErrorQuotaExhausted:
      'The model service quota has been used up. Check your model provider quota settings or try again later.',
    coworkErrorInsufficientBalance: 'Insufficient API balance. Check your model provider account and try again.',
    coworkErrorInputTooLong: 'Input too long, exceeding model context limit.',
    coworkErrorMessageTooLarge:
      'This message is too large. Reduce attachments, compress images, or split it up. (Keep each message under about 30 MB.)',
    coworkErrorCouldNotProcessPdf: 'Unable to process the PDF file.',
    coworkErrorModelNotFound: 'The requested model does not exist or is unavailable.',
    coworkGatewaySessionSyncTimeout: 'The OpenClaw engine is responding slowly and your message has not been sent. Please wait a minute or two and resend. If this happens frequently, check system memory and disk usage, and add EgoAI to your antivirus allowlist.',
    coworkErrorTranscriptOversized: 'This task history is too large. The message was not sent to protect the AI engine. Continue in a new task; the original task will be preserved.',
    coworkErrorGatewayHeapOutOfMemory: 'The local AI engine ran out of memory and is restarting automatically. This task may be too large; wait for recovery and continue in a new task.',
    coworkErrorGatewayDisconnected: 'AI engine connection lost. Please retry.',
    coworkErrorServiceRestart: 'AI engine is restarting. Please try again later.',
    coworkErrorGatewayDraining: 'AI engine is restarting. Please wait a moment and try again.',
    openClawConfigApplyPending: 'OpenClaw is applying configuration. Please try again shortly.',
    openClawConfigApplyOverdue:
      'OpenClaw is waiting for active tasks to finish before applying configuration. Complete or stop the active tasks, then try again.',
    coworkErrorModelResponseTimeout: 'The model response timed out. Please try again.',
    coworkErrorNetworkError: 'Network connection failed. Please check your network settings.',
    coworkErrorRateLimit: 'Too many requests. Please try again later.',
    coworkErrorModelOverloaded:
      'The model service is temporarily busy or at capacity. Please try again later.',
    coworkErrorContentFiltered:
      'Content did not pass the safety review. Please modify and try again.',
    coworkErrorToolLoopBlocked:
      'This turn was stopped safely because the AI kept repeating the same tool call with no new progress (usually while waiting on a slow background task). The background task may still be running — send another message to continue.',
    coworkErrorServerError: 'Server error occurred. Please try again later.',
    coworkErrorEngineNotReady: 'AI engine is starting up. Please wait a few seconds and try again.',
    coworkErrorModelStreamEmptySseData:
      'Model stream format error: the model service returned an empty SSE data frame. Please retry later or check the current model proxy configuration.',
    coworkErrorModelStreamOnlyEmptySseData:
      'Model stream stayed empty: the model service kept returning empty SSE data frames. Please retry later or check the current model proxy configuration.',
    coworkErrorUnknown:
      'Task failed due to an unexpected error. Please retry. If the issue persists, check your model configuration.',
    coworkBtwDisconnected: 'The AI engine disconnected before the BTW side question completed.',
    coworkBtwTimeout: 'The BTW side question timed out. Please try again.',
    coworkBtwInvalidResult: 'The AI engine returned an invalid BTW side-question result.',
    coworkBtwFailed: 'The BTW side question failed. Please try again.',
    coworkBtwRequestRequired: 'Session, run id, and BTW side question are required.',
    coworkBtwInvalidIdentifier: 'The BTW session or run identifier is invalid.',
    coworkBtwQuestionRequired: 'Enter a BTW side question.',
    coworkBtwSingleLine: 'BTW side questions currently support one line only.',
    coworkBtwResultTruncated: '(Answer truncated because it was too long.)',
    coworkBtwAlreadyPending: 'This conversation already has a pending BTW side question.',
    coworkBtwRunConflict: 'The BTW side-question run id conflicts with an existing run.',
    coworkBtwSessionNotFound: 'Session {sessionId} was not found.',
    coworkBtwUnavailable: 'BTW side questions are unavailable in the current runtime.',
    coworkBtwSubmitFailed: 'Failed to submit the BTW side question.',
    coworkBtwNoPending: 'No pending BTW side question was found.',
    coworkBtwStopFailed: 'Failed to stop the BTW side question. Please try again.',
    execApprovalApproved:
      'The user approved the command execution. Please check the result and continue.',
    execApprovalDenied: 'The user denied the command execution.',

    // Skill manager errors
    skillErrNoSkillMd: 'No SKILL.md found in source',
    skillErrInvalidSource:
      'Invalid skill source. Use owner/repo, repo URL, npm package spec, ClawHub URL, or a GitHub tree/blob URL.',
    skillErrClawhubNotFound: 'Skill not found on ClawHub. Please check the URL.',
    skillErrClawhubDownloadFailed: 'Failed to download skill from ClawHub. Please try again later.',

    // Auth quota
    dataMigrationBackupDialogTitle: 'Back Up EgoAI Data',
    dataMigrationRestoreDialogTitle: 'Import EgoAI Data Backup',
    dataMigrationBackupArchiveFilter: 'EgoAI Backup',
    dataMigrationAllFilesFilter: 'All Files',
    dataMigrationBackupBlockedByActiveWorkloads:
      'An agent or scheduled task is still running. Stop it or wait for it to finish before backing up.',
    dataMigrationRestoreProgressTitle: 'Importing EgoAI data',
    dataMigrationRestoreProgressDesc:
      'Restoring the backup and validating data. EgoAI will restart automatically when finished.',
    dataMigrationRestoreProgressWarning:
      'Do not close the app or restart the computer, or the migration may be interrupted.',

    // ── IM connectivity test messages ───────────────────────────────────
    // Common
    getApiKey: 'Get API Key',
    testConnection: 'Test Connection',
  },
};

let currentLanguage: LanguageType = 'zh';

/** Set the active language. Call this when app_config.language changes. */
export function setLanguage(language: LanguageType): void {
  currentLanguage = language;
}

export function getLanguage(): LanguageType {
  return currentLanguage;
}

/**
 * Look up a translation key and optionally interpolate `{param}` placeholders.
 * Returns the key itself if no translation exists.
 *
 *   t('imMissingCredentials', { fields: 'appId, appSecret' })
 *   // => "缺少必要配置项: appId, appSecret"
 */
export function t(key: string, params?: Record<string, string | number>): string {
  let text =
    translations[currentLanguage][key] ??
    translations[currentLanguage === 'zh' ? 'en' : 'zh'][key] ??
    key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  return text;
}
