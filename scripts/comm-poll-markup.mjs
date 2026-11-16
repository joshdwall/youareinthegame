/** Poll card markup from config/communications.json (render-first: buttons exist before any data, start disabled). */
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function pollBlock(poll) {
  const buttons = poll.options.filter((o) => o.active !== false).map((o) => `      <button type="button" data-answer="${esc(o.id)}" disabled>${esc(o.label)}</button>\n`).join('');
  return `     <!-- comm:poll ${poll.id} (generated at build from config/communications.json) -->\n` +
    `     <h2 id="discoveryQuestion">${esc(poll.question)}</h2>\n` +
    `     <div id="discoveryChoices" class="discovery-choices" data-poll="${esc(poll.id)}" role="group" aria-labelledby="discoveryQuestion">\n` +
    buttons +
    '     </div>\n' +
    '     <!-- /comm:poll -->\n';
}

/** Replace the marked block in html with the block generated for that poll id. */
export function renderPollBlocks(html, config) {
  return html.replace(/ {5}<!-- comm:poll ([a-z0-9-]+) [^\n]*-->\n[\s\S]*? {5}<!-- \/comm:poll -->\n/g, (all, id) => {
    const poll = (config.polls || []).find((p) => p.id === id);
    if (!poll) throw new Error(`worldmap/index.html names poll ${id}, config/communications.json has no such poll`);
    return pollBlock(poll);
  });
}
