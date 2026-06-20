async function load_current_user() {
    const response = await fetch("/me", {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
    })
    if (!response.ok) return
    const user = await response.json()
    const display = (user.first_name && user.last_name)
        ? `${user.first_name} ${user.last_name}`
        : user.username
    document.getElementById("sidebar-username").textContent = display
}

async function load_portfolio_balance(portfolio_id) {
    const response = await fetch(`/portfolios/${portfolio_id}/balance`, {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
    })
    if (!response.ok) return
    const data = await response.json()
    const formatted = data.balance.toFixed(2) + " PLN"
    document.getElementById("portfolio-balance-display").textContent = "Saldo: " + formatted
    document.getElementById("form-balance-display").textContent = formatted
}

async function login(username, password) {
    const formData = new FormData()
    formData.append("username", username)
    formData.append("password", password)

    const response = await fetch("/login", {
        method: "POST",
        body: formData
    })

    if (response.ok) {
        const data = await response.json()
        localStorage.setItem("token", data.access_token)
        document.getElementById("login").classList.add("hidden")
        document.getElementById("register").classList.add("hidden")
        document.getElementById("logged-view").classList.remove("hidden")
        load_current_user()
    } else {
        alert("Błędny login lub hasło.")
    }
}

async function register(username, password, first_name, last_name) {
    const response = await fetch("/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, first_name, last_name })
    })
    if (response.ok) {
        await login(username, password)
    } else {
        alert("Błąd rejestracji — użytkownik już istnieje.")
    }
}

async function add_portfolio(name, is_public) {
    const response = await fetch("/create-portfolio", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${localStorage.getItem("token")}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ name, is_public })
    })
    if (response.ok) {
        document.getElementById("add-portfolio").classList.add("hidden")
        document.getElementById("view-portfolios").classList.remove("hidden")
        load_portfolios()
    }
}

async function delete_portfolio(portfolio_id) {
    const response = await fetch(`/portfolios/${portfolio_id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
    })
    if (response.ok) {
        load_portfolios()
    }
}

async function open_portfolio(portfolio_id, portfolio_name) {
    current_portfolio_id = portfolio_id
    current_portfolio_name = portfolio_name
    hide_all_views()
    document.getElementById("view-portfolio-detail").classList.remove("hidden")
    document.getElementById("portfolio-detail-name").textContent = portfolio_name

    load_portfolio_balance(portfolio_id)

    const list = document.getElementById("portfolio-transactions-list")
    list.innerHTML = "<p>Ładowanie danych...</p>"

    const response = await fetch(`/portfolios/${portfolio_id}/summary`, {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
    })
    if (!response.ok) {
        list.innerHTML = "<p>Błąd ładowania danych.</p>"
        return
    }
    const data = await response.json()
    render_positions_table(data, "portfolio-transactions-list", portfolio_id)
}

let sell_ticker = null
let sell_portfolio_id_ctx = null

function open_sell_form(ticker, stock_name, currency, portfolio_id, max_qty) {
    sell_ticker = ticker
    sell_portfolio_id_ctx = portfolio_id
    document.getElementById("sell-ticker-label").textContent = `${ticker} — ${stock_name}`
    document.getElementById("sell-currency").textContent = currency || ""
    const qty_input = document.getElementById("sell-quantity")
    qty_input.value = ""
    qty_input.max = max_qty
    qty_input.placeholder = `Ilość (maks. ${max_qty})`
    document.getElementById("sell-price").value = ""
    document.getElementById("sell-date").value = ""
    hide_all_views()
    document.getElementById("sell-transaction").classList.remove("hidden")
}

async function submit_sell() {
    const quantity = document.getElementById("sell-quantity").value
    const price = document.getElementById("sell-price").value
    const date = document.getElementById("sell-date").value

    if (!date) { alert("Data sprzedaży jest obowiązkowa."); return }
    const qty_input = document.getElementById("sell-quantity")
    if (parseFloat(quantity) > parseFloat(qty_input.max)) {
        alert(`Nie możesz sprzedać więcej niż posiadasz (maks. ${qty_input.max}).`)
        return
    }

    const response = await fetch("/add-transaction", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${localStorage.getItem("token")}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            ticker: sell_ticker,
            transaction_type: "sell",
            quantity: parseFloat(quantity),
            price: price ? parseFloat(price) : null,
            transaction_date: date,
            portfolio_id: sell_portfolio_id_ctx,
            use_balance: false
        })
    })

    if (response.ok) {
        document.getElementById("sell-transaction").classList.add("hidden")
        open_portfolio(sell_portfolio_id_ctx, current_portfolio_name)
    } else {
        const err = await response.json()
        alert("Błąd sprzedaży: " + (err.detail || "nieznany błąd"))
    }
}

async function delete_transaction(transaction_id) {
    const response = await fetch(`/transactions/${transaction_id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
    })
    if (response.ok) {
        open_portfolio(current_portfolio_id, current_portfolio_name)
    }
}

async function load_portfolios() {
    const response = await fetch("/portfolios", {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
    })
    if (!response.ok) return
    const portfolios = await response.json()
    const list = document.getElementById("portfolios-list")
    list.innerHTML = ""
    if (portfolios.length === 0) {
        list.innerHTML = "<p>Brak portfeli — dodaj pierwszy.</p>"
        return
    }
    portfolios.forEach(p => {
        const card = document.createElement("div")
        card.classList.add("portfolio-card")
        card.innerHTML = `
            <strong>${p.name}</strong>
            <p>${p.is_public ? "Publiczny" : "Prywatny"}</p>
            <button onclick="open_portfolio(${p.id}, '${p.name}')">Wejdź</button>
            <button class="delete-btn" onclick="delete_portfolio(${p.id})">Usuń</button>
        `
        list.appendChild(card)
    })
}

function render_summary_block(data) {
    const unrealized_class = data.unrealized_profit_pln >= 0 ? "profit-positive" : "profit-negative"
    const total_class = data.total_profit_pln >= 0 ? "profit-positive" : "profit-negative"
    const realized_class = data.realized_profit_pln >= 0 ? "profit-positive" : "profit-negative"
    const realized_row = data.realized_profit_pln !== 0
        ? `<span class="${realized_class}">Zrealizowane: <strong>${data.realized_profit_pln >= 0 ? "+" : ""}${data.realized_profit_pln.toFixed(2)} PLN</strong></span>`
        : ""
    return `
        <div id="portfolio-summary">
            <span>Zainwestowane: <strong>${data.cost_basis_pln.toFixed(2)} PLN</strong></span>
            <span class="${unrealized_class}">Niezrealizowane: <strong>${data.unrealized_profit_pln >= 0 ? "+" : ""}${data.unrealized_profit_pln.toFixed(2)} PLN</strong></span>
            ${realized_row}
            <span class="${total_class}">Łączny zysk/strata: <strong>${data.total_profit_pln >= 0 ? "+" : ""}${data.total_profit_pln.toFixed(2)} PLN</strong></span>
            <span class="muted">Aktualna wartość: <strong>${data.current_value_pln.toFixed(2)} PLN</strong></span>
        </div>`
}

function render_positions_table(data, container_id, portfolio_id = null) {
    const list = document.getElementById(container_id)

    const positions = {}
    data.transactions.forEach(t => {
        if (!positions[t.ticker]) {
            positions[t.ticker] = {
                ticker: t.ticker,
                stock_name: t.stock_name,
                quantity: 0,
                total_buy_cost: 0,
                total_buy_qty: 0,
                current_price: null,
                currency: t.currency
            }
        }
        if (t.transaction_type === "buy") {
            positions[t.ticker].quantity += t.quantity
            positions[t.ticker].total_buy_cost += (t.price || 0) * t.quantity
            positions[t.ticker].total_buy_qty += t.quantity
            if (t.current_price) positions[t.ticker].current_price = t.current_price
        } else {
            positions[t.ticker].quantity -= t.quantity
        }
    })

    const open_positions = Object.values(positions).filter(p => p.quantity > 0.00001)

    if (open_positions.length === 0) {
        list.innerHTML = "<p>Brak otwartych pozycji.</p>" + render_summary_block(data)
        return
    }

    const actions_th = portfolio_id !== null ? "<th></th>" : ""
    const rows = open_positions.map(p => {
        const avg_price = p.total_buy_qty > 0 ? p.total_buy_cost / p.total_buy_qty : 0
        const unrealized = p.current_price !== null ? (p.current_price - avg_price) * p.quantity : null
        const profit_class = unrealized !== null && unrealized >= 0 ? "profit-positive" : "profit-negative"
        const sell_btn = portfolio_id !== null
            ? `<button class="sell-btn" onclick="open_sell_form('${p.ticker}', '${p.stock_name}', '${p.currency || ""}', ${portfolio_id}, ${p.quantity})">Sprzedaj</button>`
            : ""
        const actions_td = portfolio_id !== null ? `<td class="actions-cell">${sell_btn}</td>` : ""
        return `
            <tr>
                <td><strong>${p.ticker}</strong></td>
                <td>${p.stock_name}</td>
                <td>${p.quantity}</td>
                <td>${avg_price.toFixed(2)} ${p.currency || ""}</td>
                <td>${p.current_price !== null ? p.current_price.toFixed(2) + " " + (p.currency || "") : "—"}</td>
                <td class="${profit_class}">${unrealized !== null ? (unrealized >= 0 ? "+" : "") + unrealized.toFixed(2) + " " + (p.currency || "") : "—"}</td>
                ${actions_td}
            </tr>`
    }).join("")

    list.innerHTML = `
        <table id="portfolio-table">
            <thead>
                <tr>
                    <th>Ticker</th>
                    <th>Nazwa</th>
                    <th>Ilość</th>
                    <th>Śr. cena zakupu</th>
                    <th>Aktualna cena</th>
                    <th>Niezrealizowane</th>
                    ${actions_th}
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
        ${render_summary_block(data)}`
}

function render_summary_table(data, container_id, portfolio_id = null) {
    const list = document.getElementById(container_id)
    if (data.transactions.length === 0) {
        list.innerHTML = "<p>Brak transakcji.</p>"
        return
    }

    const net_qty = {}
    data.transactions.forEach(t => {
        if (!net_qty[t.ticker]) net_qty[t.ticker] = 0
        net_qty[t.ticker] += t.transaction_type === "buy" ? t.quantity : -t.quantity
    })

    const actions_th = portfolio_id !== null ? "<th></th>" : ""
    const rows = data.transactions.map(t => {
        const is_sell = t.transaction_type === "sell"
        const profit_val = t.profit !== null
            ? (t.profit >= 0 ? "+" : "") + t.profit.toFixed(2) + " " + (t.currency || "")
            : "—"
        const profit_class_row = t.profit !== null && t.profit >= 0 ? "profit-positive" : "profit-negative"
        const current_price_cell = is_sell
            ? `<td class="muted">—</td>`
            : `<td>${t.current_price ? t.current_price.toFixed(2) + " " + (t.currency || "") : "—"}</td>`
        let actions_td = ""
        if (portfolio_id !== null) {
            const available = net_qty[t.ticker] || 0
            const sell_btn = !is_sell && available > 0
                ? `<button class="sell-btn" onclick="open_sell_form('${t.ticker}', '${t.stock_name}', '${t.currency || ""}', ${portfolio_id}, ${available})">Sprzedaj</button>`
                : ""
            actions_td = `<td class="actions-cell">${sell_btn}<button class="delete-btn" onclick="delete_transaction(${t.id})">Usuń</button></td>`
        }
        return `
            <tr>
                <td><strong>${t.ticker}</strong></td>
                <td>${t.stock_name}</td>
                <td class="${is_sell ? "type-sell" : "type-buy"}">${t.transaction_type.toUpperCase()}</td>
                <td>${t.quantity}</td>
                <td>${t.price ? t.price.toFixed(2) + " " + (t.currency || "") : "—"}</td>
                ${current_price_cell}
                <td class="${profit_class_row}">${profit_val}</td>
                <td>${t.transaction_date ? new Date(t.transaction_date).toLocaleDateString("pl-PL") : "—"}</td>
                ${actions_td}
            </tr>`
    }).join("")

    list.innerHTML = `
        <table id="portfolio-table">
            <thead>
                <tr>
                    <th>Ticker</th><th>Nazwa</th><th>Typ</th><th>Ilość</th>
                    <th>Cena</th><th>Aktualna cena</th><th>Zysk/Strata</th><th>Data</th>
                    ${actions_th}
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
        ${render_summary_block(data)}`
}

async function load_transactions() {
    const list = document.getElementById("transactions-list")
    list.innerHTML = "<p>Ładowanie danych...</p>"
    const response = await fetch("/summary", {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
    })
    if (!response.ok) { list.innerHTML = "<p>Błąd ładowania danych.</p>"; return }
    const data = await response.json()
    render_summary_table(data, "transactions-list", null)
}

async function load_users() {
    const response = await fetch("/users", {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
    })
    if (!response.ok) return
    const users = await response.json()
    const tbody = document.getElementById("users-table-body")
    tbody.innerHTML = ""
    users.forEach(u => {
        const row = document.createElement("tr")
        row.innerHTML = `
            <td>${u.id}</td>
            <td>${u.username}</td>
            <td><button class="view-btn" onclick="open_user_portfolios(${u.id}, '${u.username}')">Portfele publiczne</button></td>`
        tbody.appendChild(row)
    })
}

async function open_user_portfolios(user_id, username) {
    hide_all_views()
    document.getElementById("view-user-portfolios").classList.remove("hidden")
    document.getElementById("user-portfolios-name").textContent = `Publiczne portfele: ${username}`
    const list = document.getElementById("user-portfolios-list")
    list.innerHTML = "<p>Ładowanie...</p>"
    const response = await fetch(`/users/${user_id}/portfolios`, {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
    })
    if (!response.ok) { list.innerHTML = "<p>Błąd ładowania.</p>"; return }
    const portfolios = await response.json()
    if (portfolios.length === 0) {
        list.innerHTML = "<p>Ten użytkownik nie ma publicznych portfeli.</p>"
        return
    }
    list.innerHTML = ""
    portfolios.forEach(p => {
        const card = document.createElement("div")
        card.classList.add("portfolio-card")
        card.innerHTML = `
            <strong>${p.name}</strong>
            <button onclick="open_public_portfolio(${p.id}, '${p.name}')">Zobacz</button>`
        list.appendChild(card)
    })
}

async function open_public_portfolio(portfolio_id, portfolio_name) {
    hide_all_views()
    document.getElementById("view-public-portfolio").classList.remove("hidden")
    document.getElementById("public-portfolio-name").textContent = portfolio_name
    const list = document.getElementById("public-portfolio-transactions-list")
    list.innerHTML = "<p>Ładowanie danych...</p>"
    const response = await fetch(`/portfolios/${portfolio_id}/summary`, {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
    })
    if (!response.ok) { list.innerHTML = "<p>Błąd ładowania danych.</p>"; return }
    const data = await response.json()
    render_positions_table(data, "public-portfolio-transactions-list", null)
}

let chart_allocation = null
let chart_profit = null

async function load_charts() {
    const response = await fetch("/summary", {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
    })
    if (!response.ok) return
    const data = await response.json()

    const net_qty = {}
    const current_prices = {}
    data.transactions.forEach(t => {
        if (!net_qty[t.ticker]) net_qty[t.ticker] = 0
        net_qty[t.ticker] += t.transaction_type === "buy" ? t.quantity : -t.quantity
        if (t.current_price) current_prices[t.ticker] = t.current_price
    })

    const allocation_labels = []
    const allocation_values = []
    Object.entries(net_qty).forEach(([ticker, qty]) => {
        if (qty > 0 && current_prices[ticker]) {
            allocation_labels.push(ticker)
            allocation_values.push(parseFloat((current_prices[ticker] * qty).toFixed(2)))
        }
    })

    const profit_labels = []
    const profit_values = []
    const profit_colors = []
    data.transactions.forEach(t => {
        if (t.profit !== null) {
            profit_labels.push(`${t.ticker} (${t.transaction_type.toUpperCase()})`)
            profit_values.push(t.profit)
            profit_colors.push(t.profit >= 0 ? "seagreen" : "indianred")
        }
    })

    if (chart_allocation) chart_allocation.destroy()
    if (chart_profit) chart_profit.destroy()

    chart_allocation = new Chart(document.getElementById("chart-allocation").getContext("2d"), {
        type: "doughnut",
        data: { labels: allocation_labels, datasets: [{ data: allocation_values, borderWidth: 1 }] },
        options: { responsive: true, plugins: { legend: { position: "right" } } }
    })

    chart_profit = new Chart(document.getElementById("chart-profit").getContext("2d"), {
        type: "bar",
        data: {
            labels: profit_labels,
            datasets: [{ label: "Zysk/Strata", data: profit_values, backgroundColor: profit_colors, borderWidth: 1 }]
        },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    })
}

async function fill_portfolio_select(preselect_id = null) {
    const response = await fetch("/portfolios", {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
    })
    if (!response.ok) return
    const portfolios = await response.json()
    const select = document.getElementById("transaction-portfolio-id")
    select.innerHTML = "<option value=''>-- Wybierz portfel --</option>"
    portfolios.forEach(p => {
        const option = document.createElement("option")
        option.value = p.id
        option.textContent = p.name
        if (preselect_id && p.id === preselect_id) option.selected = true
        select.appendChild(option)
    })
}

async function add_transaction(ticker, transaction_type, quantity, price, transaction_date, portfolio_id, use_balance) {
    const response = await fetch("/add-transaction", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${localStorage.getItem("token")}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            ticker,
            transaction_type,
            quantity: parseFloat(quantity),
            price: price ? parseFloat(price) : null,
            transaction_date,
            portfolio_id: parseInt(portfolio_id),
            use_balance
        })
    })

    if (response.ok) {
        document.getElementById("add-transaction").classList.add("hidden")
        load_balance()
        if (current_portfolio_id) {
            open_portfolio(current_portfolio_id, current_portfolio_name)
        } else {
            document.getElementById("view-transactions").classList.remove("hidden")
            load_transactions()
        }
    } else {
        const data = await response.json()
        alert("Błąd: " + (data.detail || "nieznany błąd"))
    }
}

async function deposit(amount) {
    const response = await fetch(`/portfolios/${current_portfolio_id}/deposit`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${localStorage.getItem("token")}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ amount: parseFloat(amount), portfolio_id: current_portfolio_id })
    })
    if (response.ok) {
        const data = await response.json()
        const formatted = data.balance.toFixed(2) + " PLN"
        document.getElementById("portfolio-balance-display").textContent = "Saldo: " + formatted
        document.getElementById("form-balance-display").textContent = formatted
        document.getElementById("deposit-modal").classList.add("hidden")
        open_portfolio(current_portfolio_id, current_portfolio_name)
    } else {
        const err = await response.json()
        alert("Błąd: " + (err.detail || "nieznany błąd"))
    }
}

function logout() {
    localStorage.removeItem("token")
    document.getElementById("logged-view").classList.add("hidden")
    document.getElementById("login").classList.remove("hidden")
}

let current_portfolio_id = null
let current_portfolio_name = null

function hide_all_views() {
    const ids = [
        "view-portfolios", "view-transactions", "view-users", "view-charts",
        "view-user-portfolios", "view-public-portfolio", "add-portfolio",
        "add-transaction", "sell-transaction", "view-portfolio-detail",
        "deposit-modal"
    ]
    ids.forEach(id => document.getElementById(id).classList.add("hidden"))
}

// ── Event listeners ──────────────────────────────────────────────────────────

document.getElementById("login-submit").addEventListener("click", async () => {
    await login(document.getElementById("login-username").value, document.getElementById("login-password").value)
})

document.getElementById("register-submit").addEventListener("click", async () => {
    await register(
        document.getElementById("register-username").value,
        document.getElementById("register-password").value,
        document.getElementById("register-first-name").value || null,
        document.getElementById("register-last-name").value || null
    )
})

document.getElementById("login-page").addEventListener("click", () => {
    document.getElementById("register").classList.add("hidden")
    document.getElementById("login").classList.remove("hidden")
})

document.getElementById("register-page").addEventListener("click", () => {
    document.getElementById("login").classList.add("hidden")
    document.getElementById("register").classList.remove("hidden")
})

document.getElementById("logout").addEventListener("click", logout)

document.getElementById("nav-portfolios").addEventListener("click", () => {
    hide_all_views()
    document.getElementById("view-portfolios").classList.remove("hidden")
    load_portfolios()
})

document.getElementById("nav-transactions").addEventListener("click", () => {
    hide_all_views()
    document.getElementById("view-transactions").classList.remove("hidden")
    load_transactions()
})

document.getElementById("nav-charts").addEventListener("click", () => {
    hide_all_views()
    document.getElementById("view-charts").classList.remove("hidden")
    load_charts()
})

document.getElementById("nav-users").addEventListener("click", () => {
    hide_all_views()
    document.getElementById("view-users").classList.remove("hidden")
    load_users()
})

document.getElementById("user-portfolios-back").addEventListener("click", () => {
    hide_all_views()
    document.getElementById("view-users").classList.remove("hidden")
    load_users()
})

document.getElementById("public-portfolio-back").addEventListener("click", () => {
    document.getElementById("view-public-portfolio").classList.add("hidden")
    document.getElementById("view-user-portfolios").classList.remove("hidden")
})

document.getElementById("deposit-btn").addEventListener("click", async () => {
    const response = await fetch(`/portfolios/${current_portfolio_id}/balance`, {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
    })
    const data = response.ok ? await response.json() : { balance: 0 }
    document.getElementById("deposit-current-balance").textContent = `Aktualne saldo: ${data.balance.toFixed(2)} PLN`
    document.getElementById("deposit-amount").value = ""
    hide_all_views()
    document.getElementById("deposit-modal").classList.remove("hidden")
})

document.getElementById("deposit-submit").addEventListener("click", async () => {
    const amount = document.getElementById("deposit-amount").value
    if (!amount || parseFloat(amount) <= 0) { alert("Podaj kwotę większą niż 0."); return }
    await deposit(amount)
})

document.getElementById("deposit-cancel").addEventListener("click", () => {
    document.getElementById("deposit-modal").classList.add("hidden")
    open_portfolio(current_portfolio_id, current_portfolio_name)
})

document.getElementById("add-portfolio-btn").addEventListener("click", () => {
    document.getElementById("view-portfolios").classList.add("hidden")
    document.getElementById("add-portfolio").classList.remove("hidden")
})

document.getElementById("portfolio-submit").addEventListener("click", async () => {
    await add_portfolio(
        document.getElementById("portfolio-name").value,
        document.getElementById("portfolio-public").checked
    )
})

document.getElementById("portfolio-cancel").addEventListener("click", () => {
    document.getElementById("add-portfolio").classList.add("hidden")
    document.getElementById("view-portfolios").classList.remove("hidden")
})

document.getElementById("add-transaction-btn").addEventListener("click", async () => {
    current_portfolio_id = null
    document.getElementById("view-transactions").classList.add("hidden")
    document.getElementById("add-transaction").classList.remove("hidden")
    await fill_portfolio_select()
    document.getElementById("form-balance-display").textContent = "— PLN"
})

document.getElementById("add-transaction-detail-btn").addEventListener("click", async () => {
    document.getElementById("view-portfolio-detail").classList.add("hidden")
    document.getElementById("add-transaction").classList.remove("hidden")
    await fill_portfolio_select(current_portfolio_id)
    if (current_portfolio_id) load_portfolio_balance(current_portfolio_id)
})

document.getElementById("portfolio-detail-back").addEventListener("click", () => {
    hide_all_views()
    document.getElementById("view-portfolios").classList.remove("hidden")
    load_portfolios()
})

document.getElementById("sell-submit").addEventListener("click", submit_sell)

document.getElementById("sell-cancel").addEventListener("click", () => {
    document.getElementById("sell-transaction").classList.add("hidden")
    open_portfolio(sell_portfolio_id_ctx, current_portfolio_name)
})

document.getElementById("transaction-cancel").addEventListener("click", () => {
    document.getElementById("add-transaction").classList.add("hidden")
    if (current_portfolio_id) {
        open_portfolio(current_portfolio_id, current_portfolio_name)
    } else {
        document.getElementById("view-transactions").classList.remove("hidden")
    }
})

document.getElementById("transaction-submit").addEventListener("click", async () => {
    const ticker = document.getElementById("transaction-ticker").value
    const transaction_type = document.getElementById("transaction-type").value
    const quantity = document.getElementById("transaction-quantity").value
    const price = document.getElementById("transaction-price").value
    const transaction_date = document.getElementById("transaction-date").value
    const portfolio_id = document.getElementById("transaction-portfolio-id").value
    const use_balance = document.getElementById("transaction-use-balance").checked
    if (!transaction_date) { alert("Data transakcji jest obowiązkowa."); return }
    await add_transaction(ticker, transaction_type, quantity, price, transaction_date, portfolio_id, use_balance)
})

document.getElementById("transaction-ticker").addEventListener("input", async () => {
    const q = document.getElementById("transaction-ticker").value
    if (q.length < 2) return
    const response = await fetch(`/search?q=${encodeURIComponent(q)}`)
    if (!response.ok) return
    const results = await response.json()
    const datalist = document.getElementById("ticker-suggestions")
    datalist.innerHTML = ""
    results.forEach(r => {
        const option = document.createElement("option")
        option.value = r.symbol
        option.label = r.name
        datalist.appendChild(option)
    })
})

document.getElementById("transaction-ticker").addEventListener("change", async () => {
    const symbol = document.getElementById("transaction-ticker").value.trim()
    const currencySpan = document.getElementById("transaction-currency")
    if (!symbol) { currencySpan.textContent = ""; return }
    const response = await fetch(`/ticker-currency?symbol=${encodeURIComponent(symbol)}`)
    if (!response.ok) { currencySpan.textContent = ""; return }
    const data = await response.json()
    currencySpan.textContent = data.currency || ""
})

if (localStorage.getItem("token")) {
    document.getElementById("login").classList.add("hidden")
    document.getElementById("logged-view").classList.remove("hidden")
    load_current_user()
}
