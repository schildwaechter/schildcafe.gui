document.addEventListener('DOMContentLoaded', () => {
    let API_BASE_URL = 'http://localhost:1333';

    // DOM Elements
    const listReceived = document.getElementById('list-received');
    const listPrep = document.getElementById('list-prep');
    const listReady = document.getElementById('list-ready');
    
    const countReceived = document.getElementById('count-received');
    const countPrep = document.getElementById('count-prep');
    const countReady = document.getElementById('count-ready');

    // Initialize
    init();

    async function init() {
        try {
            const configResponse = await fetch('config.json');
            const config = await configResponse.json();

            if (config.apiBaseUrl) {
                API_BASE_URL = config.apiBaseUrl;
            }
        } catch (error) {
            console.error('Failed to load config:', error);
        }

        // Start polling
        pollOrders();
        setInterval(pollOrders, 2000);
    }

    async function pollOrders() {
        try {
            const response = await fetch(`${API_BASE_URL}/order-list`);
            if (!response.ok) return;

            const data = await response.json();
            // Flatten all orders
            const allOrders = Object.values(data).flat();
            
            renderBoard(allOrders);
        } catch (error) {
            console.error('Polling error:', error);
        }
    }

    function renderBoard(orders) {
        // Clear current lists
        listReceived.innerHTML = '';
        listPrep.innerHTML = '';
        listReady.innerHTML = '';

        let cReceived = 0;
        let cPrep = 0;
        let cReady = 0;

        // Sort orders by time (assuming orderReceived is ISO string)
        orders.sort((a, b) => new Date(a.orderReceived) - new Date(b.orderReceived));

        orders.forEach(order => {
            const card = createOrderCard(order);

            if (order.orderReady) {
                // Ready
                // Only show if NOT retrieved yet? Or show retrieved as well?
                // Requirement says "shows status... orders received, in preparation and progress"
                // Usually kitchen board shows until picked up.
                if (!order.orderRetrieved) {
                    listReady.appendChild(card);
                    cReady++;
                }
            } else if (order.orderBrewed > 0) {
                // In Preparation
                listPrep.appendChild(card);
                cPrep++;
            } else {
                // Received
                listReceived.appendChild(card);
                cReceived++;
            }
        });

        // Update counts
        countReceived.textContent = cReceived;
        countPrep.textContent = cPrep;
        countReady.textContent = cReady;
    }

    function createOrderCard(order) {
        const card = document.createElement('div');
        card.className = 'order-card';
        
        // Calculate progress
        const progress = Math.round((order.orderBrewed / order.orderSize) * 100);
        
        // Format time
        const time = new Date(order.orderReceived).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        card.innerHTML = `
            <div class="card-header">
                <span class="order-id">#${order.orderId.substring(0, 8)}</span>
                <span class="order-time">${time}</span>
            </div>
            <div class="card-body">
                <div class="progress-bar-container">
                    <div class="progress-bar" style="width: ${progress}%"></div>
                </div>
                <div class="status-text">
                    ${order.orderBrewed} / ${order.orderSize} items brewed
                </div>
            </div>
        `;
        return card;
    }
});
