document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = 'http://localhost:1333';

    // State
    let orderItems = {}; // { "Espresso": 2, "Latte": 1 }
    let currentOrderId = null;
    let pollInterval = null;

    // DOM Elements
    const orderSection = document.getElementById('order-section');
    const statusSection = document.getElementById('status-section');
    const submitBtn = document.getElementById('submit-order-btn');
    const retrieveBtn = document.getElementById('retrieve-btn');
    const newOrderBtn = document.getElementById('new-order-btn');
    const orderIdDisplay = document.getElementById('order-id-display');
    const brewedCountDisplay = document.getElementById('brewed-count');
    const totalCountDisplay = document.getElementById('total-count');
    const currentStatusDisplay = document.getElementById('current-status');
    const progressRingBar = document.querySelector('.progress-ring__bar');
    const orderItemsList = document.getElementById('order-items-list');

    // Initialize Menu Counters
    document.querySelectorAll('.menu-item').forEach(item => {
        const productName = item.dataset.product;
        const minusBtn = item.querySelector('.minus');
        const plusBtn = item.querySelector('.plus');
        const countDisplay = item.querySelector('.count');

        minusBtn.addEventListener('click', () => updateCount(productName, -1, countDisplay));
        plusBtn.addEventListener('click', () => updateCount(productName, 1, countDisplay));
    });

    // Event Listeners
    submitBtn.addEventListener('click', submitOrder);
    retrieveBtn.addEventListener('click', retrieveOrder);
    newOrderBtn.addEventListener('click', resetApp);

    // Functions
    function updateCount(product, change, displayElement) {
        if (!orderItems[product]) orderItems[product] = 0;

        const newCount = orderItems[product] + change;

        if (newCount >= 0) {
            orderItems[product] = newCount;
            displayElement.textContent = newCount;

            // Remove key if 0 to keep object clean
            if (newCount === 0) delete orderItems[product];

            updateSubmitButton();
        }
    }

    function updateSubmitButton() {
        const totalItems = Object.values(orderItems).reduce((a, b) => a + b, 0);
        submitBtn.disabled = totalItems === 0;
    }

    async function submitOrder() {
        const coffeeOrder = Object.entries(orderItems).map(([product, count]) => ({
            product,
            count
        }));

        if (coffeeOrder.length === 0) return;

        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending Order...';

        try {
            const response = await fetch(`${API_BASE_URL}/submit-order`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ coffeeOrder })
            });

            if (!response.ok) throw new Error('Failed to submit order');

            const data = await response.json();
            // The API returns the ID directly as a string based on swagger: 
            // "responses": { "200": { "schema": { "type": "string" } } }
            // However, fetch .json() might parse it. Let's handle both object/string cases just in case.
            // Actually looking at swagger, it says schema type string. So it might be just "UUID".
            // But usually JSON APIs return valid JSON, so "UUID".

            currentOrderId = data;

            // Switch to status view
            showStatusView();
            startPolling();

        } catch (error) {
            console.error('Error submitting order:', error);
            alert('Could not submit order. Is the server running?');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Brew My Coffee';
        }
    }

    function showStatusView() {
        orderSection.classList.remove('active');
        orderSection.classList.add('hidden');

        statusSection.classList.remove('hidden');
        statusSection.classList.add('active');

        orderIdDisplay.textContent = `#${currentOrderId.substring(0, 8)}...`;

        // Populate summary list
        orderItemsList.innerHTML = '';
        Object.entries(orderItems).forEach(([product, count]) => {
            const div = document.createElement('div');
            div.className = 'summary-item';
            div.innerHTML = `<span>${product}</span><span>x${count}</span>`;
            orderItemsList.appendChild(div);
        });
    }

    function startPolling() {
        // Poll immediately then every 2 seconds
        checkStatus();
        pollInterval = setInterval(checkStatus, 2000);
    }

    async function checkStatus() {
        try {
            const response = await fetch(`${API_BASE_URL}/order-list`);
            if (!response.ok) return;

            const data = await response.json();
            // data is map[string]order
            const order = data[currentOrderId];

            if (order) {
                updateStatusUI(order);
            } else {
                // Order might be lost or not found?
                console.warn('Order not found in list');
            }

        } catch (error) {
            console.error('Polling error:', error);
        }
    }

    function updateStatusUI(order) {
        const brewed = order.orderBrewed || 0;
        const total = order.orderSize || 0;
        const isReady = !!order.orderReady;

        brewedCountDisplay.textContent = brewed;
        totalCountDisplay.textContent = total;

        // Update Progress Ring
        const radius = 52;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (brewed / total) * circumference;
        progressRingBar.style.strokeDashoffset = offset;

        if (isReady) {
            currentStatusDisplay.textContent = "Ready to Serve!";
            currentStatusDisplay.style.color = "var(--success-color)";
            document.querySelector('.loading-dots').style.display = 'none';
            retrieveBtn.classList.remove('hidden');

            // Stop polling once ready? No, wait for retrieve.
            // Actually, if we want to see it's retrieved, we might keep polling?
            // But the user action is to click retrieve.
            if (pollInterval) {
                clearInterval(pollInterval);
                pollInterval = null;
            }
        } else {
            currentStatusDisplay.textContent = brewed > 0 ? "Brewing..." : "Queued";
            currentStatusDisplay.style.color = "var(--primary-color)";
        }
    }

    async function retrieveOrder() {
        try {
            retrieveBtn.disabled = true;
            retrieveBtn.textContent = "Retrieving...";

            const response = await fetch(`${API_BASE_URL}/retrieve-order/${currentOrderId}`);

            if (response.ok) {
                currentStatusDisplay.textContent = "Enjoy your coffee!";
                retrieveBtn.classList.add('hidden');
                newOrderBtn.classList.remove('hidden');
            } else {
                throw new Error('Failed to retrieve');
            }
        } catch (error) {
            console.error('Retrieve error:', error);
            alert('Error retrieving order.');
            retrieveBtn.disabled = false;
            retrieveBtn.textContent = "Retrieve Order";
        }
    }

    function resetApp() {
        // Reset State
        orderItems = {};
        currentOrderId = null;
        if (pollInterval) clearInterval(pollInterval);

        // Reset UI
        document.querySelectorAll('.count').forEach(el => el.textContent = '0');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Brew My Coffee';

        retrieveBtn.classList.add('hidden');
        retrieveBtn.disabled = false;
        retrieveBtn.textContent = "Retrieve Order";

        newOrderBtn.classList.add('hidden');
        document.querySelector('.loading-dots').style.display = 'block';
        currentStatusDisplay.style.color = "var(--primary-color)";

        // Switch Views
        statusSection.classList.remove('active');
        statusSection.classList.add('hidden');

        orderSection.classList.remove('hidden');
        orderSection.classList.add('active');
    }
});
