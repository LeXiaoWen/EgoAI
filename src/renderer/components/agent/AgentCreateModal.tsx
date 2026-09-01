import { XMarkIcon } from '@heroicons/react/24/outline';
import { DefaultAgentAvatarIcon } from '@shared/agent/avatar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';

import { agentService } from '../../services/agent';
import { coworkService } from '../../services/cowork';
import { i18nService } from '../../services/i18n';
import { resolveThinkingLevelForModel } from '../../services/modelThinkingLevelMemory';
import type { RootState } from '../../store';
import type { Model } from '../../store/slices/modelSlice';
import type { PresetAgent } from '../../types/agent';
import { getAgentDisplayName } from '../../utils/agentDisplay';
import { toOpenClawModelRef } from '../../utils/openclawModelRef';
import Modal from '../common/Modal';
import AgentAvatarIcon from './AgentAvatarIcon';
import AgentAvatarPicker from './AgentAvatarPicker';
import AgentConfirmDialog from './AgentConfirmDialog';
import AgentDetailToolbar from './AgentDetailToolbar';
import AgentSkillSelector from './AgentSkillSelector';
import { AgentConfirmDialogVariant, AgentDetailTab } from './constants';

interface AgentCreateModalProps {
  isOpen?: boolean;
  onClose: () => void;
  presentation?: 'modal' | 'page';
}

const AgentCreateModal: React.FC<AgentCreateModalProps> = ({
  isOpen = true,
  onClose,
  presentation = 'modal',
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [identity, setIdentity] = useState('');
  const [userInfo, setUserInfo] = useState('');
  const [icon, setIcon] = useState(DefaultAgentAvatarIcon);
  const [model, setModel] = useState<Model | null>(null);
  const [workingDirectory, setWorkingDirectory] = useState('');
  const [skillIds, setSkillIds] = useState<string[]>([]);
  const [subagentAllowAgentIds, setSubagentAllowAgentIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [presetTemplates, setPresetTemplates] = useState<PresetAgent[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [activeTab, setActiveTab] = useState<AgentDetailTab>(AgentDetailTab.Identity);
  const globalSelectedModel = useSelector((state: RootState) => state.model.defaultSelectedModel);
  const agents = useSelector((state: RootState) => state.agent.agents);
  const currentAgentId = useSelector((state: RootState) => state.agent.currentAgentId);
  const coworkConfig = useSelector((state: RootState) => state.cowork.config);
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);
  const initialWorkingDirectoryRef = useRef('');
  const initialModelRef = useRef('');
  const initialUserInfoRef = useRef('');
  const initializedOpenRef = useRef(false);

  const getChangedFields = useCallback((): string[] => {
    const changedFields: string[] = [];
    if (name.trim()) changedFields.push('name');
    if (description.trim()) changedFields.push('description');
    if (systemPrompt.trim()) changedFields.push('systemPrompt');
    if (identity.trim()) changedFields.push('identity');
    if (userInfo !== initialUserInfoRef.current) changedFields.push('userInfo');
    if (icon !== DefaultAgentAvatarIcon) changedFields.push('icon');
    if ((model ? toOpenClawModelRef(model) : '') !== initialModelRef.current) changedFields.push('model');
    if (workingDirectory !== initialWorkingDirectoryRef.current) changedFields.push('workingDirectory');
    if (skillIds.length > 0) changedFields.push('skillIds');
    if (subagentAllowAgentIds.length > 0) changedFields.push('subagentAllowAgentIds');
    return changedFields;
  }, [description, icon, identity, model, name, skillIds.length, subagentAllowAgentIds.length, systemPrompt, userInfo, workingDirectory]);

  useEffect(() => {
    if (!isOpen) {
      initializedOpenRef.current = false;
      return;
    }
    if (initializedOpenRef.current) return;
    initializedOpenRef.current = true;
    setName('');
    setDescription('');
    setSystemPrompt('');
    setIdentity('');
    setUserInfo('');
    initialUserInfoRef.current = '';
    setIcon(DefaultAgentAvatarIcon);
    const currentAgent = agents.find((agent) => agent.id === currentAgentId);
    const defaultWorkingDirectory = currentAgent?.workingDirectory?.trim() || coworkConfig.workingDirectory || '';
    initialWorkingDirectoryRef.current = defaultWorkingDirectory;
    initialModelRef.current = globalSelectedModel ? toOpenClawModelRef(globalSelectedModel) : '';
    setModel(globalSelectedModel ?? null);
    setWorkingDirectory(defaultWorkingDirectory);
    setSkillIds([]);
    setSubagentAllowAgentIds([]);
    setActiveTab(AgentDetailTab.Identity);
    setShowUnsavedConfirm(false);
    setShowTemplatePicker(false);

    setTemplatesLoading(true);
    agentService.getPresetTemplates()
      .then(setPresetTemplates)
      .finally(() => setTemplatesLoading(false));
  }, [agents, coworkConfig.workingDirectory, currentAgentId, globalSelectedModel, isOpen]);

  useEffect(() => {
    if (!isOpen || model || !globalSelectedModel) return;
    if (!initialModelRef.current) {
      initialModelRef.current = toOpenClawModelRef(globalSelectedModel);
    }
    setModel(globalSelectedModel);
  }, [globalSelectedModel, isOpen, model]);

  if (!isOpen) return null;

  const resetForm = () => {
    setName('');
    setDescription('');
    setSystemPrompt('');
    setIdentity('');
    setUserInfo('');
    initialUserInfoRef.current = '';
    setIcon(DefaultAgentAvatarIcon);
    setModel(null);
    setWorkingDirectory('');
    setSkillIds([]);
    setSubagentAllowAgentIds([]);
    setActiveTab(AgentDetailTab.Identity);
    setShowTemplatePicker(false);
  };

  const handleApplyTemplate = (preset: PresetAgent) => {
    const isEn = i18nService.getLanguage() === 'en';
    const templateName = isEn && preset.nameEn ? preset.nameEn : preset.name;
    setName(templateName);
    setDescription(isEn && preset.descriptionEn ? preset.descriptionEn : preset.description);
    setSystemPrompt(isEn && preset.systemPromptEn ? preset.systemPromptEn : preset.systemPrompt);
    setIdentity(isEn && preset.identityEn ? preset.identityEn : preset.identity);
    setIcon(preset.icon?.trim() || DefaultAgentAvatarIcon);
    setSkillIds(preset.skillIds ?? []);

    setActiveTab(AgentDetailTab.Identity);
    setShowTemplatePicker(false);
  };

  const handleClose = () => {
    const changedFields = getChangedFields();
    if (changedFields.length > 0) {
      
      setShowUnsavedConfirm(true);
    } else {
      
      onClose();
    }
  };

  const handleConfirmDiscard = () => {
    
    setShowUnsavedConfirm(false);
    onClose();
  };

  const handleCancelDiscard = () => {
    
    setShowUnsavedConfirm(false);
  };

  const handleTabChange = (targetTab: AgentDetailTab) => {
    if (targetTab === activeTab) return;
    
    setActiveTab(targetTab);
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const agent = await agentService.createAgent({
        name: name.trim(),
        description: description.trim(),
        systemPrompt: systemPrompt.trim(),
        identity: identity.trim(),
        model: model ? toOpenClawModelRef(model) : '',
        thinkingLevel: resolveThinkingLevelForModel(model),
        workingDirectory: workingDirectory.trim(),
        icon: icon.trim() || undefined,
        skillIds,
        subagentAllowAgentIds,
      });
      if (agent) {
        if (userInfo !== initialUserInfoRef.current) {
          const userInfoSaved = await coworkService.writeBootstrapFile('USER.md', userInfo, { agentId: agent.id });
          if (!userInfoSaved) {
            console.warn(`[AgentCreateModal] failed to save USER.md for agent ${agent.id}`);
            window.dispatchEvent(new CustomEvent('app:showToast', { detail: i18nService.t('agentSaveFailed') }));
          }
        }
        agentService.switchAgent(agent.id);
        
        onClose();
        resetForm();
      } else {
        
        window.dispatchEvent(new CustomEvent('app:showToast', { detail: i18nService.t('agentCreateFailed') }));
      }
    } catch {
      
      window.dispatchEvent(new CustomEvent('app:showToast', { detail: i18nService.t('agentCreateFailed') }));
    } finally {
      setCreating(false);
    }
  };

  const availableSubagentAgents = agents
    .filter((candidate) => candidate.enabled)
    .sort((left, right) => getAgentDisplayName(left).localeCompare(getAgentDisplayName(right)));

  const handleToggleSubagentAllowAgent = (targetAgentId: string) => {
    setSubagentAllowAgentIds((current) => {
      if (current.includes(targetAgentId)) {
        return current.filter(id => id !== targetAgentId);
      }
      return [...current, targetAgentId];
    });
  };

  const tabs: { key: AgentDetailTab; label: string }[] = [
    { key: AgentDetailTab.Identity, label: i18nService.t('coworkBootstrapIdentityTitle') },
    { key: AgentDetailTab.Prompt, label: i18nService.t('coworkBootstrapSoulTitle') },
    { key: AgentDetailTab.User, label: i18nService.t('coworkBootstrapUserTitle') },
    { key: AgentDetailTab.Skills, label: i18nService.t('agentTabSkills') },
    { key: AgentDetailTab.Collaboration, label: i18nService.t('agentTabCollaboration') },
  ];

  const renderTextEditor = (
    value: string,
    onChange: (value: string) => void,
    placeholder: string,
    ariaLabel: string,
    hint: string,
  ) => (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <p className="shrink-0 text-xs leading-5 text-secondary">
        {hint}
      </p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="min-h-0 flex-1 w-full resize-none border border-transparent bg-transparent text-sm leading-6 text-foreground placeholder:text-secondary/45 focus:outline-none"
      />
    </div>
  );

  const renderCollaborationSettings = () => (
    <div className="h-full overflow-y-auto">
      <div className="mb-4">
        <div className="text-sm font-semibold text-foreground">
          {i18nService.t('agentSubagentsTitle')}
        </div>
        <p className="mt-1 text-xs leading-5 text-secondary">
          {i18nService.t('agentSubagentsHint')}
        </p>
      </div>
      {availableSubagentAgents.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-secondary">
          {i18nService.t('agentSubagentsEmpty')}
        </div>
      ) : (
        <div className="space-y-1">
          {availableSubagentAgents.map((candidate) => {
            const checked = subagentAllowAgentIds.includes(candidate.id);
            return (
              <label
                key={candidate.id}
                className="flex cursor-pointer items-center justify-between gap-4 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-raised"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-raised text-sm">
                    <span className="font-medium text-secondary">
                      {getAgentDisplayName(candidate).slice(0, 1).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">
                      {getAgentDisplayName(candidate)}
                    </div>
                    <div className="truncate text-xs text-secondary">
                      {candidate.id}
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => handleToggleSubagentAllowAgent(candidate.id)}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  aria-label={getAgentDisplayName(candidate)}
                />
              </label>
            );
          })}
        </div>
      )}
    </div>
  );

  const editorContent = (
    <>
      <div className="flex shrink-0 items-start justify-between gap-4 px-7 py-5">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <AgentAvatarPicker value={icon} onChange={setIcon} />
          <div className="min-w-0 flex-1 pt-0.5">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={i18nService.t('agentNamePlaceholder')}
              aria-label={i18nService.t('agentName')}
              className="w-full bg-transparent text-lg font-semibold leading-6 text-foreground placeholder:text-secondary/40 focus:outline-none"
              autoFocus
            />
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={i18nService.t('agentDescriptionPlaceholder')}
              aria-label={i18nService.t('agentDescription')}
              className="mt-0.5 w-full bg-transparent text-sm leading-5 text-secondary placeholder:text-secondary/50 focus:outline-none"
            />
          </div>
        </div>
        <div className="mt-1 flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => {
              
              setShowTemplatePicker(true);
            }}
            className="h-8 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground hover:bg-surface-raised transition-colors"
          >
            {i18nService.t('agentUseTemplate')}
          </button>
          <button type="button" onClick={handleClose} className="p-2 rounded-lg hover:bg-surface-raised transition-colors">
            <XMarkIcon className="h-5 w-5 text-secondary" />
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex shrink-0 border-b border-border px-7">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => handleTabChange(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
              activeTab === tab.key
                ? 'text-foreground'
                : 'text-secondary hover:text-foreground'
            }`}
          >
            {tab.label}
            {activeTab === tab.key && (
              <div className="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-foreground rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="px-7 py-7 overflow-hidden flex-1 min-h-0">
        {activeTab === AgentDetailTab.Prompt && renderTextEditor(
          systemPrompt,
          setSystemPrompt,
          i18nService.t('coworkBootstrapPlaceholder'),
          i18nService.t('coworkBootstrapSoulTitle'),
          i18nService.t('coworkBootstrapSoulHint'),
        )}

        {activeTab === AgentDetailTab.Identity && renderTextEditor(
          identity,
          setIdentity,
          i18nService.t('coworkBootstrapPlaceholder'),
          i18nService.t('coworkBootstrapIdentityTitle'),
          i18nService.t('coworkBootstrapIdentityHint'),
        )}

        {activeTab === AgentDetailTab.User && renderTextEditor(
          userInfo,
          setUserInfo,
          i18nService.t('coworkBootstrapPlaceholder'),
          i18nService.t('coworkBootstrapUserTitle'),
          i18nService.t('coworkBootstrapUserHint'),
        )}

        {activeTab === AgentDetailTab.Skills && (
          <AgentSkillSelector selectedSkillIds={skillIds} onChange={setSkillIds} />
        )}

        {activeTab === AgentDetailTab.Collaboration && renderCollaborationSettings()}
      </div>

      {/* Footer */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-t border-border">
        <AgentDetailToolbar
          model={model}
          onModelChange={setModel}
          workingDirectory={workingDirectory}
          onWorkingDirectoryChange={setWorkingDirectory}
        />
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={handleCreate}
            disabled={!name.trim() || creating}
            className="h-9 px-5 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {creating ? i18nService.t('creating') : i18nService.t('create')}
          </button>
        </div>
      </div>
    </>
  );

  const closeTemplatePicker = () => {
    
    setShowTemplatePicker(false);
  };

  const content = showTemplatePicker ? (
    <AgentTemplatePickerContent
      presets={presetTemplates}
      loading={templatesLoading}
      onClose={closeTemplatePicker}
      onNew={closeTemplatePicker}
      onSelect={handleApplyTemplate}
    />
  ) : editorContent;

  return (
    <>
      {presentation === 'page' ? (
        <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-surface bg-surface shadow-sm">
          {content}
        </div>
      ) : (
        <Modal
          isOpen={isOpen}
          onClose={showTemplatePicker ? closeTemplatePicker : handleClose}
          overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/10 dark:bg-black/50"
          className="w-[calc(100vw-56px)] max-w-[854px] h-[82vh] max-h-[664px] rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.16)] bg-surface border border-surface flex flex-col overflow-hidden"
        >
          {content}
        </Modal>
      )}

      {showUnsavedConfirm && (
        <AgentConfirmDialog
          variant={AgentConfirmDialogVariant.Unsaved}
          title={i18nService.t('agentUnsavedTitle')}
          message={i18nService.t('agentUnsavedMessage')}
          cancelLabel={i18nService.t('agentUnsavedStay')}
          confirmLabel={i18nService.t('agentUnsavedDiscard')}
          onCancel={handleCancelDiscard}
          onConfirm={handleConfirmDiscard}
        />
      )}
    </>
  );
};

const AgentTemplatePickerContent: React.FC<{
  presets: PresetAgent[];
  loading: boolean;
  onClose: () => void;
  onNew: () => void;
  onSelect: (preset: PresetAgent) => void;
}> = ({ presets, loading, onClose, onNew, onSelect }) => {
  const isEn = i18nService.getLanguage() === 'en';

  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-3 px-7 py-5">
        <h2 className="text-lg font-semibold text-foreground">
          {i18nService.t('agentTemplateTitle')}
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onNew}
            className="h-8 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground hover:bg-surface-raised transition-colors"
          >
            {i18nService.t('agentTemplateNew')}
          </button>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-surface-raised transition-colors">
            <XMarkIcon className="h-5 w-5 text-secondary" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-7">
        {loading ? (
          <div className="flex h-40 items-center justify-center text-sm text-secondary">
            {i18nService.t('loading')}
          </div>
        ) : presets.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-secondary">
            {i18nService.t('agentTemplateEmpty')}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {presets.map((preset) => {
              const name = isEn && preset.nameEn ? preset.nameEn : preset.name;
              const description = isEn && preset.descriptionEn ? preset.descriptionEn : preset.description;

              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onSelect(preset)}
                  className="group flex min-h-[132px] flex-col items-start rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:border-primary/40 hover:bg-surface-raised"
                >
                  <div className="flex w-full items-center gap-3">
                    <AgentAvatarIcon
                      value={preset.icon}
                      className="h-8 w-8"
                      iconClassName="h-5 w-5"
                      legacyClassName="text-2xl"
                    />
                    <div className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                      {name}
                    </div>
                  </div>
                  <div className="mt-3 text-sm leading-6 text-foreground/90 line-clamp-3">
                    {description}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};

export default AgentCreateModal;
