// charts.js
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
const detailsPanel = document.getElementById('detailsPanel');
const searchInput = document.getElementById('stockSearch');
const suggestionsBox = document.getElementById('suggestions');

let currentSymbol = 'AAPL'; // default until search picks something else
let currentInterval = '1day'; // default interval
let currentOutputsize = 90;  // default data points
let debounceTimer;

// Fetch and render the candlestick chart
async function loadCandles(symbol) {
  try {
    // Pass the interval and outputsize to the backend query
    const response = await fetch(`/api/stocks/candles/${symbol}?interval=${currentInterval}&outputsize=${currentOutputsize}`, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Could not load chart data.');
    }

    const chartData = result.data.map(item => ({
      time: item.time,
      open: parseFloat(item.open),
      high: parseFloat(item.high),
      low: parseFloat(item.low),
      close: parseFloat(item.close)
    }));

    renderChart(chartData);
  } catch (error) {
    console.error('Chart data error:', error);
  }
}

// Fetch and render the details panel data
async function loadStockQuote(symbol) {
  try {
    detailsPanel.innerHTML = `<p class="details-empty">Loading ${symbol} details...</p>`;

    const response = await fetch(`/api/stocks/quote/${symbol}`, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Could not load quote data.');
    }

    renderDetails(result.data, symbol);
  } catch (error) {
    console.error('Quote data error:', error);
    detailsPanel.innerHTML = `<p class="details-empty">Could not load details for ${symbol}.</p>`;
  }
}

function renderChart(chartData) {
  const trace = {
    type: 'candlestick',
    x: chartData.map(d => d.time),
    open: chartData.map(d => d.open),
    high: chartData.map(d => d.high),
    low: chartData.map(d => d.low),
    close: chartData.map(d => d.close),
    increasing: { line: { color: '#4ade80' }, fillcolor: '#4ade80' }, 
    decreasing: { line: { color: '#f87171' }, fillcolor: '#f87171' }, 
  };

  // Format the X-axis tooltip nicely depending on the interval
  let tickFormat;
  if (currentInterval === '1day' || currentInterval === '1week') {
    tickFormat = '%b %d, %Y'; // e.g., Oct 25, 2023
  } else {
    tickFormat = '%b %d, %H:%M'; // e.g., Oct 25, 14:30
  }

  const layout = {
    dragmode: 'zoom',
    shapes: [],
    annotations: [],
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { color: '#ffffff' },
    margin: { t: 20, r: 20, b: 40, l: 50 },
    xaxis: {
      rangeslider: { visible: false },
      gridcolor: 'rgba(255, 255, 255, 0.08)',
      linecolor: 'rgba(255, 255, 255, 0.2)',
      tickformat: tickFormat 
    },
    yaxis: {
      gridcolor: 'rgba(255, 255, 255, 0.08)',
      linecolor: 'rgba(255, 255, 255, 0.2)'
    }
  };

  const config = {
    displayModeBar: false,
    scrollZoom: true,
    responsive: true,
  };

  Plotly.newPlot(chartDiv, [trace], layout, config);
  setupToolbar();
}

function renderDetails(data, symbol) {
  const name = data.name || symbol;
  const price = data.currentPrice ? data.currentPrice.toFixed(2) : 'N/A';
  const high = data.highOfDay ? data.highOfDay.toFixed(2) : 'N/A';
  const low = data.lowOfDay ? data.lowOfDay.toFixed(2) : 'N/A';
  
  const change = data.change ? parseFloat(data.change) : 0;
  const isUp = change >= 0;
  const changeColor = isUp ? '#4ade80' : '#f87171'; 
  const changeSymbol = isUp ? '▲' : '▼';
  const changeText = isUp ? `+${change.toFixed(2)}` : `${change.toFixed(2)}`;

  detailsPanel.innerHTML = `
    <div style="text-align: left; width: 100%; color: #0a1f44; font-family: 'Lexend Deca', sans-serif; box-sizing: border-box;">
      <h2 style="margin: 0 0 5px 0; font-size: 24px; color: #0a1f44; word-wrap: break-word;">${name}</h2>
      <p style="margin: 0 0 20px 0; font-size: 14px; color: rgba(10, 31, 68, 0.6); text-transform: uppercase; letter-spacing: 1px;">${symbol}</p>
      
      <div style="margin-bottom: 20px;">
        <span style="font-size: 36px; font-weight: bold; color: #0a1f44;">$${price}</span>
        <span style="font-size: 16px; font-weight: bold; color: ${changeColor}; margin-left: 10px;">
          ${changeSymbol} ${changeText}%
        </span>
      </div>

      <div style="display: flex; justify-content: space-between; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid rgba(10, 31, 68, 0.1);">
        <span style="color: rgba(10, 31, 68, 0.6);">Day High</span>
        <span style="font-weight: bold;">$${high}</span>
      </div>
      <div style="display: flex; justify-content: space-between; padding-bottom: 10px;">
        <span style="color: rgba(10, 31, 68, 0.6);">Day Low</span>
        <span style="font-weight: bold;">$${low}</span>
      </div>
    </div>
  `;
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

// ---- Search & Autocomplete Wiring ----

function handleSearch() {
  const query = searchInput.value.trim().toUpperCase();
  if (query) {
    currentSymbol = query;
    loadCandles(currentSymbol);
    loadStockQuote(currentSymbol); // Load details panel data
  }
}

// Listen for typing in the search bar for autocomplete
searchInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  const query = searchInput.value.trim();

  if (query.length === 0) {
    suggestionsBox.style.display = 'none';
    return;
  }

  // Debounce: wait 300ms after the user stops typing to make the API call
  debounceTimer = setTimeout(async () => {
    try {
      const response = await fetch(`/api/stocks/search/${query}`, {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const result = await response.json();

      if (result.success && result.data.length > 0) {
        suggestionsBox.innerHTML = result.data.map(stock => `
          <div class="suggestion-item" data-symbol="${stock.symbol}">
            <span class="suggestion-symbol">${stock.symbol}</span>
            <span class="suggestion-name">${stock.name} (${stock.exchange})</span>
          </div>
        `).join('');
        
        suggestionsBox.style.display = 'block';

        document.querySelectorAll('.suggestion-item').forEach(item => {
          item.addEventListener('click', () => {
            searchInput.value = item.dataset.symbol;
            suggestionsBox.style.display = 'none';
            handleSearch(); 
          });
        });
      } else {
        suggestionsBox.innerHTML = `<div class="suggestion-item"><span class="suggestion-name">No stocks found for "${query}"</span></div>`;
        suggestionsBox.style.display = 'block';
      }
    } catch (error) {
      console.error('Autocomplete error:', error);
    }
  }, 300);
});

// Hide suggestions if the user clicks outside the search bar
document.addEventListener('click', (e) => {
  if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
    suggestionsBox.style.display = 'none';
  }
});

document.querySelector('.search-btn')?.addEventListener('click', (e) => {
  e.preventDefault();
  handleSearch();
});

searchInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    handleSearch();
  }
});

// ---- Interval Button Wiring ----
document.querySelectorAll('.interval-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    // Remove active class from all buttons
    document.querySelectorAll('.interval-btn').forEach(b => b.classList.remove('active'));
    // Add active to clicked button
    btn.classList.add('active');
    
    // Update variables and reload chart
    currentInterval = btn.dataset.interval;
    currentOutputsize = btn.dataset.outputsize;
    
    loadCandles(currentSymbol);
  });
});

// ---- Initial Load ----
loadCandles(currentSymbol);
loadStockQuote(currentSymbol);