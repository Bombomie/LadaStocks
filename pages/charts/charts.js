async function loadCurrentUser() {
  try {
    const response = await fetch('/api/auth/me', {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });

    if (response.status === 401) {
      window.location.replace('../authentication/login/login.html');
      return;
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Could not load user session.');
    }

    const usernameElement = document.querySelector('.username');
    if (usernameElement) {
      usernameElement.textContent = data.user.username || 'User';
    }
  } catch (error) {
    console.error('Dashboard authentication error:', error);
    window.location.replace('../authentication/login/login.html');
  }
}

loadCurrentUser();

// ---- Chart setup ----

const chartDiv = document.getElementById('candleChart');
let currentSymbol = 'AAPL'; // default until search picks something else

async function loadCandles(symbol) {
  try {
    const response = await fetch(`/api/stocks/${symbol}/candles`, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Could not load chart data.');
    }

    // expects data shaped like: { dates: [...], open: [...], high: [...], low: [...], close: [...] }
    renderChart(data);
  } catch (error) {
    console.error('Chart data error:', error);
  }
}

function renderChart({ dates, open, high, low, close }) {
  const trace = {
    type: 'candlestick',
    x: dates,
    open,
    high,
    low,
    close,
  };

  const layout = {
    dragmode: 'zoom',
    shapes: [],
    annotations: [],
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { color: '#0a1f44' },
    margin: { t: 20, r: 20, b: 40, l: 50 },
    xaxis: { rangeslider: { visible: false } },
  };

  const config = {
    displayModeBar: false, // custom toolbar replaces Plotly's built-in one
    scrollZoom: true,
    responsive: true,
  };

  Plotly.newPlot(chartDiv, [trace], layout, config);
  setupToolbar();
}

function setupToolbar() {
  document.querySelectorAll('.tool-btn[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tool-btn[data-mode]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      Plotly.relayout(chartDiv, { dragmode: btn.dataset.mode });
    });
  });

  document.getElementById('toolReset')?.addEventListener('click', () => {
    Plotly.relayout(chartDiv, { 'xaxis.autorange': true, 'yaxis.autorange': true });
  });

  let awaitingAnnotation = false;
  document.getElementById('toolAnnotate')?.addEventListener('click', () => {
    awaitingAnnotation = true;
  });

  chartDiv.on('plotly_click', (data) => {
    if (!awaitingAnnotation) return;
    const pt = data.points[0];
    const text = prompt('Annotation text:');
    if (text) {
      const newAnnotations = [...chartDiv.layout.annotations, {
        x: pt.x, y: pt.y, text, showarrow: true, arrowhead: 3,
        font: { color: '#0a1f44' }, arrowcolor: '#FFC349',
      }];
      Plotly.relayout(chartDiv, { annotations: newAnnotations });
    }
    awaitingAnnotation = false;
  });
}

// ---- Search bar wiring ----

document.querySelector('.search-btn')?.addEventListener('click', (e) => {
  e.preventDefault();
  const query = document.getElementById('stockSearch').value.trim().toUpperCase();
  if (query) {
    currentSymbol = query;
    loadCandles(currentSymbol);
  }
});

loadCandles(currentSymbol);