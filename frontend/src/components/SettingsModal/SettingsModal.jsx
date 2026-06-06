import React, { useState, useEffect } from 'react';
import { settingsApi } from '../../api/settings-api';
import { X, Eye, EyeOff, Check, AlertCircle, Loader2, Zap, Bot, Gem, Brain, Cpu } from 'lucide-react';
import './SettingsModal.scss';

const PROVIDERS = [
  { id: 'openai',    name: 'OpenAI',           icon: Bot, defaultUrl: 'https://api.openai.com/v1' },
  { id: 'gemini',    name: 'Google Gemini',     icon: Gem, defaultUrl: 'https://generativelanguage.googleapis.com' },
  { id: 'anthropic', name: 'Anthropic Claude',  icon: Brain, defaultUrl: 'https://api.anthropic.com' },
  { id: 'ollama',    name: 'Ollama (Local)',     icon: Cpu, defaultUrl: 'http://localhost:11434' },
];

const SettingsModal = ({ onClose }) => {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [localChanges, setLocalChanges] = useState({});
  const [showKeys, setShowKeys] = useState({});
  const [testResults, setTestResults] = useState({});
  const [testingProvider, setTestingProvider] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const data = await settingsApi.getSettings();
      setSettings(data.settings);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (provider, field, value) => {
    setLocalChanges(prev => ({
      ...prev,
      [provider]: { ...prev[provider], [field]: value },
    }));
  };

  const getDisplayValue = (provider, field) => {
    if (localChanges[provider]?.[field] !== undefined) {
      return localChanges[provider][field];
    }
    return settings?.providers?.[provider]?.[field] || '';
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const providers = {};
      for (const [provId, changes] of Object.entries(localChanges)) {
        providers[provId] = {};
        if (changes.apiKey !== undefined) providers[provId].apiKey = changes.apiKey;
        if (changes.baseUrl !== undefined) providers[provId].baseUrl = changes.baseUrl;
      }
      const data = await settingsApi.updateSettings({ providers });
      setSettings(data.settings);
      setLocalChanges({});
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (providerId) => {
    try {
      // Save first if there are unsaved changes for this provider
      if (localChanges[providerId]) {
        await handleSave();
      }
      setTestingProvider(providerId);
      setTestResults(prev => ({ ...prev, [providerId]: null }));
      const data = await settingsApi.testProvider(providerId);
      setTestResults(prev => ({
        ...prev,
        [providerId]: { success: data.success, message: data.message || data.error },
      }));
    } catch (err) {
      setTestResults(prev => ({
        ...prev,
        [providerId]: { success: false, message: err.message },
      }));
    } finally {
      setTestingProvider(null);
    }
  };

  const hasChanges = Object.keys(localChanges).length > 0;

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        <div className="settings-modal-header">
          <div className="settings-modal-title">
            <Zap size={20} />
            <h2>AI Provider Settings</h2>
          </div>
          <button className="settings-modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="settings-modal-body">
          {loading ? (
            <div className="settings-loading">
              <Loader2 size={24} className="spin" />
              <span>Loading settings...</span>
            </div>
          ) : error ? (
            <div className="settings-error">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          ) : (
            <div className="provider-list">
              {PROVIDERS.map(provider => {
                const providerSettings = settings?.providers?.[provider.id] || {};
                const testResult = testResults[provider.id];
                const isTesting = testingProvider === provider.id;

                return (
                  <div key={provider.id} className="provider-card">
                    <div className="provider-header">
                      <span className="provider-icon">
                        <provider.icon size={18} />
                      </span>
                      <span className="provider-name">{provider.name}</span>
                      {providerSettings.hasKey && (
                        <span className="provider-connected">
                          <Check size={12} /> Connected
                        </span>
                      )}
                    </div>

                    <div className="provider-fields">
                      <div className="field-group">
                        <label>API Key</label>
                        <div className="input-with-action">
                          <input
                            type={showKeys[provider.id] ? 'text' : 'password'}
                            placeholder={provider.id === 'ollama' ? 'Optional for local' : 'Enter API key...'}
                            value={getDisplayValue(provider.id, 'apiKey')}
                            onChange={e => handleChange(provider.id, 'apiKey', e.target.value)}
                          />
                          <button
                            className="icon-btn"
                            onClick={() => setShowKeys(prev => ({ ...prev, [provider.id]: !prev[provider.id] }))}
                            title={showKeys[provider.id] ? 'Hide' : 'Show'}
                          >
                            {showKeys[provider.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                      </div>

                      <div className="field-group">
                        <label>Base URL</label>
                        <input
                          type="text"
                          placeholder={provider.defaultUrl}
                          value={getDisplayValue(provider.id, 'baseUrl')}
                          onChange={e => handleChange(provider.id, 'baseUrl', e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="provider-actions">
                      <button
                        className={`test-btn ${testResult?.success ? 'success' : testResult?.success === false ? 'error' : ''}`}
                        onClick={() => handleTest(provider.id)}
                        disabled={isTesting}
                      >
                        {isTesting ? (
                          <><Loader2 size={14} className="spin" /> Testing...</>
                        ) : testResult?.success ? (
                          <><Check size={14} /> Connected</>
                        ) : testResult?.success === false ? (
                          <><AlertCircle size={14} /> Failed</>
                        ) : (
                          'Test Connection'
                        )}
                      </button>
                      {testResult?.message && (
                        <span className={`test-message ${testResult.success ? 'success' : 'error'}`}>
                          {testResult.message}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="settings-modal-footer">
          <button className="cancel-btn" onClick={onClose}>Cancel</button>
          <button
            className="save-btn"
            onClick={handleSave}
            disabled={!hasChanges || saving}
          >
            {saving ? <><Loader2 size={14} className="spin" /> Saving...</> : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
