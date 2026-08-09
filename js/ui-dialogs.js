// =====================================================================
// UI DIALOGS — Sostituzione di alert()/confirm()/prompt() con modal native
// =====================================================================
(function () {
    'use strict';

    let dialogRoot = null;

    function ensureRoot() {
        if (dialogRoot) return dialogRoot;
        dialogRoot = document.createElement('div');
        dialogRoot.id = 'dialogRoot';
        dialogRoot.style.cssText = 'position:fixed;inset:0;z-index:99999;display:none;';
        document.body.appendChild(dialogRoot);
        return dialogRoot;
    }

    function renderDialog({ title, message, okLabel, cancelLabel, danger, input, defaultValue, placeholder }) {
        const root = ensureRoot();
        root.style.display = 'flex';
        root.style.cssText += 'align-items:center;justify-content:center;background:rgba(15,23,42,0.55);backdrop-filter:blur(3px);';
        root.innerHTML = `
            <div class="ui-dialog" role="dialog" aria-modal="true" style="background:#fff;border-radius:18px;width:min(92vw,380px);padding:22px;box-shadow:0 24px 60px rgba(0,0,0,0.35);font-family:system-ui,-apple-system,sans-serif;">
                <h3 style="margin:0 0 8px;font-size:17px;font-weight:700;color:#0f172a;">${title}</h3>
                ${message ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#475569;white-space:pre-line;">${message}</p>` : ''}
                ${input ? `<input type="text" id="uiDialogInput" value="${(defaultValue || '').replace(/"/g, '&quot;')}" placeholder="${(placeholder || '').replace(/"/g, '&quot;')}" style="width:100%;box-sizing:border-box;padding:12px 14px;border:1px solid #cbd5e1;border-radius:10px;font-size:15px;margin-bottom:16px;outline:none;">` : ''}
                <div style="display:flex;gap:10px;justify-content:flex-end;">
                    ${cancelLabel ? `<button id="uiDialogCancel" style="flex:1;padding:12px;border:1px solid #e2e8f0;background:#f8fafc;border-radius:10px;font-size:14px;font-weight:600;color:#475569;cursor:pointer;">${cancelLabel}</button>` : ''}
                    <button id="uiDialogOk" style="flex:1;padding:12px;border:none;border-radius:10px;font-size:14px;font-weight:700;color:#fff;cursor:pointer;background:${danger ? '#ef4444' : '#3b82f6'};">${okLabel || 'OK'}</button>
                </div>
            </div>`;
        return root;
    }

    function closeDialog(root) {
        root.style.display = 'none';
        root.innerHTML = '';
    }

    function showConfirm({ title = 'Conferma', message, okLabel = 'Conferma', cancelLabel = 'Annulla', danger = false }) {
        return new Promise(resolve => {
            const root = renderDialog({ title, message, okLabel, cancelLabel, danger });
            const onOk = () => { cleanup(); resolve(true); };
            const onCancel = () => { cleanup(); resolve(false); };
            const cleanup = () => {
                document.getElementById('uiDialogOk')?.removeEventListener('click', onOk);
                document.getElementById('uiDialogCancel')?.removeEventListener('click', onCancel);
                root.removeEventListener('click', onBackdrop);
                closeDialog(root);
            };
            const onBackdrop = (e) => { if (e.target === root) onCancel(); };
            document.getElementById('uiDialogOk').addEventListener('click', onOk);
            document.getElementById('uiDialogCancel')?.addEventListener('click', onCancel);
            root.addEventListener('click', onBackdrop);
            document.getElementById('uiDialogOk').focus();
        });
    }

    function showPrompt({ title = 'Inserisci un valore', message, defaultValue = '', placeholder = '', okLabel = 'OK', cancelLabel = 'Annulla' }) {
        return new Promise(resolve => {
            const root = renderDialog({ title, message, okLabel, cancelLabel, input: true, defaultValue, placeholder });
            const inputEl = document.getElementById('uiDialogInput');
            const onOk = () => { cleanup(); resolve(inputEl.value); };
            const onCancel = () => { cleanup(); resolve(null); };
            const onEnter = (e) => { if (e.key === 'Enter') onOk(); };
            const onBackdrop = (e) => { if (e.target === root) onCancel(); };
            const cleanup = () => {
                document.getElementById('uiDialogOk')?.removeEventListener('click', onOk);
                document.getElementById('uiDialogCancel')?.removeEventListener('click', onCancel);
                inputEl.removeEventListener('keydown', onEnter);
                root.removeEventListener('click', onBackdrop);
                closeDialog(root);
            };
            document.getElementById('uiDialogOk').addEventListener('click', onOk);
            document.getElementById('uiDialogCancel')?.addEventListener('click', onCancel);
            inputEl.addEventListener('keydown', onEnter);
            root.addEventListener('click', onBackdrop);
            inputEl.focus();
            inputEl.select();
        });
    }

    window.showConfirmDialog = showConfirm;
    window.showPromptDialog = showPrompt;

    // Toast persistente (al posto di alert semplice)
    window.showAlertDialog = function (message, title = 'Attenzione') {
        return showConfirm({ title, message, okLabel: 'OK', cancelLabel: null });
    };
})();
