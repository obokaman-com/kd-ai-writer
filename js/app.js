import { initAuth, getAuthToken } from './auth.js';
import { setAuthToken, fetchCompanies, fetchCompanyProfile, writeDraft, fetchContext, cancelRequest } from './data.js';
import { systemPrompt, rolePrompts, identityPrompts, taskPrompts, tweakPrompts } from './preferences.js';

async function initApp() {
    setAuthToken(getAuthToken());
    const prefs = JSON.parse(localStorage.getItem('kd_prefs') || '{}');
    let currentThreadId = null;

    document.addEventListener('keydown', e => { if (e.key === 'Escape') cancelRequest(); });

    async function initCompanies() {
        const companies = await fetchCompanies();  // ← aquí esperamos a que llegue el array
        const topSelect = document.getElementById('companySelectTop');
        companies.forEach(c => {
            const opt = document.createElement('option');
            opt.value   = c.company_id;
            opt.textContent = c.company_name;
            topSelect.appendChild(opt);
        });

        const choices = new Choices(topSelect, {
            placeholderValue: 'Choose a company…',
            searchPlaceholderValue: 'Write to filter…',
            shouldSort: false,
            searchResultLimit: 100,
            itemSelectText: '',
            removeItemButton: false,
        });
    }
    initCompanies();

    // Initialize Split.js for resizable panels with persisted sizes
    const verticalKey = 'splitVertical';
    const horizontalKey = 'splitHorizontal';
    const vertSizes = prefs[verticalKey] || [50, 50];
    const horzSizes = prefs[horizontalKey] || [50, 50];
    Split(['#templateContainer', '#promptContainer'], {
        direction: 'vertical',
        sizes: vertSizes,
        gutterSize: 4,
        elementStyle: (dim, size) => ({ flexBasis: size + '%' }),
        gutterStyle: (dim, size) => ({ flexBasis: size + 'px' }),
        onDragEnd: newSizes => {
            prefs[verticalKey] = newSizes;
            localStorage.setItem('kd_prefs', JSON.stringify(prefs));
        }
    });
    Split(['#leftPanel', '#rightPanel'], {
        direction: 'horizontal',
        sizes: horzSizes,
        gutterSize: 4,
        elementStyle: (dim, size) => ({ flexBasis: size + '%' }),
        gutterStyle: (dim, size) => ({ flexBasis: size + 'px' }),
        onDragEnd: newSizes => {
            prefs[horizontalKey] = newSizes;
            localStorage.setItem('kd_prefs', JSON.stringify(prefs));
        }
    });

    // Role-dependent Author dropdown
    const roleSelect      = document.getElementById('roleSelect');
    const authorContainer = document.getElementById('authorContainer');
    const authorSelect    = document.getElementById('authorSelect');
    const companyContainer= document.getElementById('companyContainer');
    const taskSelect   = document.getElementById('contentTypeSelect');
    function updateRoleDependantUI() {
        const role = roleSelect.value;
        authorSelect.innerHTML = '';
        let authors = [];
        if (role === 'sales')       authors = ['Albert Lombarte','Albert García','Toni Pinel'];
        else if (role === 'support') authors = ['Daniel López','Daniel Ortiz','David Hontecillas','Jorge Tarrero'];
        else if (role === 'finance') authors = ['Luis Martín'];
        if (authors.length) {
            authorContainer.classList.remove('hidden');
            authors.forEach((name, i) => {
                const opt = document.createElement('option'); opt.value = name; opt.textContent = name;
                if (i === 0) opt.selected = true;
                authorSelect.appendChild(opt);
            });
        } else {
            authorContainer.classList.add('hidden');
        }
        if (role === 'sales') {
            companyContainer.classList.remove('hidden');
        } else {
            companyContainer.classList.add('hidden');
            document.getElementById('companySelectTop').value = '';
        }
    }
    roleSelect.addEventListener('change', updateRoleDependantUI);
    updateRoleDependantUI();

    // Apply saved preferences
    if (prefs.role) {
        roleSelect.value = prefs.role;
    }
    updateRoleDependantUI();
    if (prefs.author) {
        authorSelect.value = prefs.author;
    }
    if (prefs.task) {
        taskSelect.value = prefs.task;
    }

    // Persist preferences on change
    roleSelect.addEventListener('change', e => {
        prefs.role = e.target.value;
        delete prefs.author;
        localStorage.setItem('kd_prefs', JSON.stringify(prefs));
        updateRoleDependantUI();
    });
    authorSelect.addEventListener('change', e => {
        prefs.author = e.target.value;
        localStorage.setItem('kd_prefs', JSON.stringify(prefs));
    });
    taskSelect.addEventListener('change', e => {
        prefs.task = e.target.value;
        localStorage.setItem('kd_prefs', JSON.stringify(prefs));
    });

    // Company context loading
    const companySelectTop = document.getElementById('companySelectTop');
    const templateArea   = document.getElementById('templateArea');
    companySelectTop.addEventListener('change', async () => {
        if (!companySelectTop.value) {
            templateArea.value = '';
            return;
        }
        const companyName = companySelectTop.options[companySelectTop.selectedIndex].text;
        templateArea.value = await fetchCompanyProfile(companyName) || '';
    });

    const md = window.markdownit({
        html:        false,
        linkify:     true,
        typographer: true
    });
    window.mdRenderer = md;

    // Generate Draft button handler
    const generateBtn  = document.getElementById('generateBtn');
    const promptArea   = document.getElementById('promptArea');
    const resultArea   = document.getElementById('resultArea');

    generateBtn.addEventListener('click', async () => {
        // Assemble prompt sequence
        const parts = [];
        const role = roleSelect.value;
        const author = authorSelect.value;
        const task = taskSelect.value;
        //parts.push(systemPrompt.trim());
        if (rolePrompts[role]) parts.push('## YOUR ROLE\n'+rolePrompts[role].trim());
        if (identityPrompts[author]) parts.push('## YOU SHOULD TALK AS\n'+identityPrompts[author].trim());
        if (taskPrompts[task]) parts.push('## YOUR TASK\n'+taskPrompts[task].trim());
        if (promptArea.value) parts.push(`## INSTRUCTIONS:\n${promptArea.value.trim()}`);
        if (templateArea.value) parts.push(`## SOME ADDITIONAL CONTEXT:\n${templateArea.value.trim()}`);

        const finalPrompt = parts.join('\n\n');

        try {
            // Use the unified prompt in the payload
            const payload = { prompt: finalPrompt };
            const data = await writeDraft(payload);
            let html = window.mdRenderer.render(data.output || '');
            html = DOMPurify.sanitize(html);
            html = html.replace(/<\/p>\s*<p>/g, '<br><br>');
            html = html.replace(/<\/?p>/g, '');
            html = html.replace(/(<br><br>\s*)+$/g, '').trim();
            resultArea.innerHTML = html;
            currentThreadId = data.threadId;
            document.getElementById('tweakToolbar').classList.remove('hidden');
        } catch {
            // errors logged in data.js
        }
    });

    async function applyTweak(type) {
        if (!currentThreadId) return;
        const tweakPrompt = tweakPrompts[type];
        if (!tweakPrompt) return;

        setButtonsDisabled(true);
        try {
            const data = await writeDraft({
                prompt: tweakPrompt.trim(),
                threadId: currentThreadId
            });
            let html = window.mdRenderer.render(data.output || '');
            html = DOMPurify.sanitize(html);
            html = html.replace(/<\/p>\s*<p>/g, '<br><br>');
            html = html.replace(/<\/?p>/g, '');
            html = html.replace(/(<br><br>\s*)+$/g, '').trim();
            resultArea.innerHTML = html;
            currentThreadId = data.threadId;
        } catch (err) {
            console.error('Error applying tweak:', err);
        }
        finally {
            setButtonsDisabled(false);
        }
    }

    let tweakBtns = document
        .querySelectorAll('#tweakToolbar button');

    tweakBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.dataset.tweak;
                applyTweak(type);
            });
        });

    function setButtonsDisabled(disabled) {
        tweakBtns.forEach(b => b.toggleAttribute('disabled', disabled));
    }

    function sanitize(html) {
        const div = document.createElement('div');
        div.innerHTML = html;
        div.querySelectorAll('[class],[style]').forEach(el => { el.removeAttribute('class'); el.removeAttribute('style'); });
        return div.innerHTML;
    }

    // Copy for Gmail using existing copy listener
    const copyBtn = document.getElementById('copyGmailBtn');
    copyBtn.addEventListener('click', () => {
        const sel = window.getSelection(); sel.removeAllRanges();
        const range = document.createRange(); range.selectNodeContents(resultArea); sel.addRange(range);
        document.execCommand('copy'); sel.removeAllRanges();
        const orig = copyBtn.innerHTML;
        copyBtn.innerHTML = '<span class="text-green-400 font-bold text-xl">✓</span>';
        setTimeout(() => { copyBtn.innerHTML = orig; }, 2000);
    });

    // Copiar con selección limpia
    resultArea.addEventListener('copy', e => {
        e.preventDefault();  // Anula la copia nativa
        const selection = window.getSelection();
        let html, text;
        if (!selection.isCollapsed && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const fragment = range.cloneContents();
            const div = document.createElement('div');
            div.appendChild(fragment);
            html = sanitize(div.innerHTML);
            text = selection.toString();
        } else {
            html = sanitize(resultArea.innerHTML);
            text = resultArea.textContent;
        }
        e.clipboardData.setData('text/html', html);
        e.clipboardData.setData('text/plain', text);
    });

    const customTweakButton   = document.getElementById('customTweakBtn');
    const customTweakModal    = document.getElementById('customModal');
    const customTweakDialog   = document.getElementById('customDialog');
    const cancelCustomButton  = document.getElementById('cancelCustom');
    const applyCustomButton   = document.getElementById('applyCustom');
    const customTweakTextarea = document.getElementById('customInput');

    function showCustomTweakModal() {
        customTweakTextarea.value = '';
        customTweakModal.classList.remove('hidden');
        requestAnimationFrame(() => {
            customTweakDialog.classList.remove('scale-95', 'opacity-0');
        });
        customTweakTextarea.focus();
    }

    function hideCustomTweakModal() {
        customTweakDialog.classList.add('scale-95', 'opacity-0');
        customTweakDialog.addEventListener('transitionend', () => {
            customTweakModal.classList.add('hidden');
        }, { once: true });
    }

    customTweakButton.addEventListener('click', showCustomTweakModal);
    cancelCustomButton.addEventListener('click', hideCustomTweakModal);
    customTweakModal.addEventListener('click', e => {
        if (e.target === customTweakModal) hideCustomTweakModal();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !customTweakModal.classList.contains('hidden')) {
            hideCustomTweakModal();
        }
    });

    applyCustomButton.addEventListener('click', async () => {
        const tweakText = customTweakTextarea.value.trim();
        if (!tweakText) {
            return customTweakTextarea.focus();
        }

        hideCustomTweakModal();

        const controlButtons = document.querySelectorAll('#tweakToolbar button, #generateBtn');
        controlButtons.forEach(btn => btn.setAttribute('disabled', ''));

        const prompt = (tweakPrompts.custom + '\n\n' + tweakText).trim();

        try {
            const data = await writeDraft({ prompt, threadId: currentThreadId });
            let html = window.mdRenderer.render(data.output || '');
            html = DOMPurify.sanitize(html);
            html = html.replace(/<\/p>\s*<p>/g, '<br><br>');
            html = html.replace(/<\/?p>/g, '');
            html = html.replace(/(<br><br>\s*)+$/g, '').trim();
            resultArea.innerHTML = html;
            currentThreadId = data.threadId;
        } catch (error) {
            console.error('Error applying custom tweak:', error);
        } finally {
            controlButtons.forEach(btn => btn.removeAttribute('disabled'));
        }
    });

    const contextImportModal     = document.getElementById('contextImportModal');
    const contextImportDialog    = document.getElementById('contextImportDialog');
    const contextImportUrlLabel  = document.getElementById('contextImportUrl');
    const cancelImportBtn        = document.getElementById('cancelImportBtn');
    const confirmImportBtn       = document.getElementById('confirmImportBtn');

    function promptImportContext(url) {
        contextImportUrlLabel.textContent = url;
        contextImportModal.classList.remove('hidden');
        // anima in
        requestAnimationFrame(() => {
            contextImportDialog.classList.remove('scale-95', 'opacity-0');
        });

        return new Promise(resolve => {
            cancelImportBtn.onclick = () => resolve(false);
            confirmImportBtn.onclick = () => resolve(true);

            function cleanup() {
                contextImportModal.classList.add('hidden');
                document.removeEventListener('keydown', onKey);
                contextImportModal.removeEventListener('click', onBackdrop);
            }
            function onKey(e) {
                if (e.key === 'Escape') resolve(false);
            }
            function onBackdrop(e) {
                if (e.target === contextImportModal) resolve(false);
            }
            document.addEventListener('keydown', onKey);
            contextImportModal.addEventListener('click', onBackdrop);

            resolve = ((origResolve) => val => {
                origResolve(val);
                cleanup();
            })(resolve);
        });
    }

    async function showErrorModal(message) {
        document.querySelector('#contextImportDialog h3').textContent = '⚠️ Error';
        document.getElementById('contextImportUrl').textContent = message;
        confirmImportBtn.classList.add('hidden');
        cancelImportBtn.textContent = 'Close';

        contextImportModal.classList.remove('hidden');
        requestAnimationFrame(() => {
            contextImportDialog.classList.remove('scale-95', 'opacity-0');
        });

        await new Promise(resolve => {
            cancelImportBtn.onclick = () => resolve();
            contextImportModal.addEventListener('click', e => {
                if (e.target === contextImportModal) resolve();
            }, { once: true });
            document.addEventListener('keydown', e => {
                if (e.key === 'Escape') resolve();
            }, { once: true });
        });

        contextImportDialog.classList.add('scale-95', 'opacity-0');
        contextImportDialog.addEventListener('transitionend', () => {
            contextImportModal.classList.add('hidden');
            document.querySelector('#contextImportDialog h3').textContent = 'Import context';
            confirmImportBtn.classList.remove('hidden');
            cancelImportBtn.textContent = 'Cancel';
        }, { once: true });
    }

    function isContextUrl(url) {
        try {
            const { host } = new URL(url);
            return host.includes('support.krakend.io') || host.includes('github.com') || host.includes('app.shortcut.com');
        } catch {
            return false;
        }
    }

    templateArea.addEventListener('paste', async e => {
        const pasted = e.clipboardData.getData('text').trim();
        if (!isContextUrl(pasted)) return;

        e.preventDefault();

        const shouldImport = await promptImportContext(pasted);
        if (!shouldImport) return;
        try{
            templateArea.value = await fetchContext(pasted);
        } catch (err) {
            await showErrorModal('Couldn\'t recover context from that URL: ' + err);
        }
    });
}

initAuth(initApp);
