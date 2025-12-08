document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('detect-form');
  const urlInput = document.getElementById('site-url');
  const resultsDiv = document.getElementById('results');
  const frameworksSelect = document.getElementById('manual-framework');

  fetch('/api/frameworks')
    .then((r) => r.json())
    .then((data) => {
      data.frameworks.forEach((f) => {
        const opt = document.createElement('option');
        opt.value = f;
        opt.textContent = f;
        frameworksSelect.appendChild(opt);
      });
    })
    .catch(() => {});

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    resultsDiv.innerHTML = 'Detecting...';
    const url = urlInput.value.trim();
    try {
      const res = await fetch('/api/detect-platform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (json.error) {
        resultsDiv.innerHTML = `<div class="error">${json.error}</div>`;
        return;
      }
      const cands = json.candidates;
      resultsDiv.innerHTML = '<h3>Detected candidates</h3>';
      const ul = document.createElement('ul');
      cands.forEach((c) => {
        const li = document.createElement('li');
        li.className = 'candidate';
        li.innerHTML = `<strong>${c.name}</strong> — ${Math.round(c.confidence * 100)}% — <em>${c.evidence}</em> <button data-name="${c.name}" class="confirm-btn">Use this</button>`;
        ul.appendChild(li);
      });
      resultsDiv.appendChild(ul);
      resultsDiv.querySelectorAll('.confirm-btn').forEach((btn) => {
        btn.addEventListener('click', (ev) => {
          const name = ev.currentTarget.dataset.name;
          resultsDiv.innerHTML = `<div>Selected: <strong>${name}</strong>. Next step: show install instructions for <strong>${name}</strong>.</div>`;
        });
      });
    } catch (err) {
      resultsDiv.innerHTML = `<div class="error">${err.toString()}</div>`;
    }
  });

  document.getElementById('manual-select-btn').addEventListener('click', () => {
    const selected = frameworksSelect.value;
    resultsDiv.innerHTML = `<div>Manually selected: <strong>${selected}</strong>. Next step: show install instructions for ${selected}.</div>`;
  });
});
