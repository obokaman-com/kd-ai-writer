import { initAuth, getAuthToken } from './auth.js';
import { setAuthToken, fetchCompanies, fetchCompanyProfile, writeDraft } from './data.js';
import { systemPrompt, rolePrompts, identityPrompts, taskPrompts } from './preferences.js';

async function initApp() {
    setAuthToken(getAuthToken());

    // Restore preferences
    const prefs = JSON.parse(localStorage.getItem('kd_prefs') || '{}');

    // Initial data load
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
            shouldSort: false,        // que conserve el orden original
            searchResultLimit: 100,   // muestra máximo 100 coincidencias
            itemSelectText: '',       // elimina el "Presiona Enter para seleccionar"
            removeItemButton: false,  // sin botón de eliminación porque es single-select
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
    const taskSelect   = document.getElementById('contentTypeSelect');
    function updateAuthorOptions() {
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
    }
    roleSelect.addEventListener('change', updateAuthorOptions);
    updateAuthorOptions();

    // Apply saved preferences
    if (prefs.role) {
        roleSelect.value = prefs.role;
    }
    updateAuthorOptions();
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
        updateAuthorOptions();
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
        if (identityPrompts[author]) parts.push('## YOU SHOULD ACT AS\n'+identityPrompts[author].trim());
        if (taskPrompts[task]) parts.push('## YOUR TASK\n'+taskPrompts[task].trim());
        if (templateArea.value) parts.push(`## SOME ADDITIONAL CONTEXT:\n${templateArea.value.trim()}`);
        if (promptArea.value)   parts.push(`## INSTRUCTIONS:\n${promptArea.value.trim()}`);

        const finalPrompt = parts.join('\n\n');

        try {
            // Use the unified prompt in the payload
            const payload = { prompt: finalPrompt };
            const data = await writeDraft(payload);
            resultArea.innerHTML = data.output || '';
        } catch {
            // errors logged in data.js
        }
    });

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
}

initAuth(initApp);
