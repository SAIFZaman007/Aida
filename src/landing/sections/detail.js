import { APP_URL } from '../config.js';
import { icon } from '../lib/icons.js';
/** Detail card under the hero fan. */
export function renderDetail(el, s) {
    el.innerHTML = `
    <div class="l">
      <h3>${s.name}<span class="role">${s.role}</span></h3>
      <p class="desc">${s.description}</p>
      <ul class="checks">${s.checks.map((c) => `<li><span class="ck">${icon('check')}</span>${c}</li>`).join('')}</ul>
    </div>
    <div class="r">
      <div class="kv"><small>Try saying</small><div class="prompt">“${s.tryPrompt}”</div></div>
      <div class="kv"><small>Profile</small><div class="row">
        <span>${icon('mic')}${s.voice}</span><span>${icon('database')}Own memory</span><span>${icon('globe')}EN · বাংলা</span>
      </div></div>
      <a class="btn btn-primary btn-sm" style="align-self:flex-start;margin-top:auto" href="${APP_URL}">Talk to ${s.name} ${icon('arrow')}</a>
    </div>`;
}
