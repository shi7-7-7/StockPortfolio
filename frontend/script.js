async function load_current_user() {
    const response = await fetch("/me", {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
    })
    if (!response.ok) return
    const user = await response.json()
    document.getElementById("sidebar-username").textContent = user.username
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
        console.error("Błędny login/hasło")
    }
}

async function register(username, password) {
    const userData = { username, password }

    const response = await fetch("/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userData)
    })

    if (response.ok) {
        await login(userData.username, userData.password)
    } else {
        console.error("Błąd z rejestracją - użytkownik jest już w bazie")
    }
}

async function add_portfolio(name, is_public) {
    const portfolioData = { name, is_public }

    const response = await fetch("/create-portfolio", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${localStorage.getItem("token")}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(portfolioData)
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
    } else {
        console.error("Błąd usuwania portfela")
    }
}

async function open_portfolio(portfolio_id, portfolio_name) {
    current_portfolio_id = portfolio_id
    current_portfolio_name = portfolio_name
    hide_all_views()
    document.getElementById("view-portfolio-detail").classList.remove("hidden")
    document.getElementById("portfolio-detail-name").textContent = portfolio_name

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

    if (data.transactions.length === 0) {
        list.innerHTML = "<p>Brak transakcji w tym portfelu.</p>"
        return
    }

    const profit_color = data.total_profit >= 0 ? "seagreen" : "indianred"
    const currencies_used = [...new Set(data.transactions.map(t => t.currency).filter(Boolean))]
    const summary_currency = currencies_used.length === 1 ? currencies_used[0] : ""
    const mixed_currency_warning = currencies_used.length > 1
        ? `<span style="color: goldenrod; font-size: 12px;">⚠ Portfel zawiera spółki w różnych walutach (${currencies_used.join(", ")}) — sumy są orientacyjne</span>`
        : ""

    list.innerHTML = `
        <table id="portfolio-table">
            <thead>
                <tr>
                    <th>Ticker</th>
                    <th>Nazwa</th>
                    <th>Typ</th>
                    <th>Ilość</th>
                    <th>Cena zakupu</th>
                    <th>Aktualna cena</th>
                    <th>Zysk/Strata</th>
                    <th>Data</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                ${data.transactions.map(t => `
                    <tr>
                        <td><strong>${t.ticker}</strong></td>
                        <td>${t.stock_name}</td>
                        <td>${t.transaction_type.toUpperCase()}</td>
                        <td>${t.quantity}</td>
                        <td>${t.price ? t.price.toFixed(2) + " " + (t.currency || "") : "—"}</td>
                        <td>${t.current_price ? t.current_price.toFixed(2) + " " + (t.currency || "") : "—"}</td>
                        <td style="color: ${t.profit >= 0 ? "seagreen" : "indianred"}">${t.profit !== null ? (t.profit >= 0 ? "+" : "") + t.profit.toFixed(2) + " " + (t.currency || "") : "—"}</td>
                        <td>${t.transaction_date ? new Date(t.transaction_date).toLocaleDateString("pl-PL") : "—"}</td>
                        <td><button class="delete-btn" onclick="delete_transaction(${t.id})">Usuń</button></td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
        <div id="portfolio-summary">
            <span>Zainwestowano: <strong>${data.total_invested.toFixed(2)} ${summary_currency}</strong></span>
            <span>Aktualna wartość: <strong>${data.current_value.toFixed(2)} ${summary_currency}</strong></span>
            <span style="color: ${profit_color}">Łączny zysk/strata: <strong>${data.total_profit >= 0 ? "+" : ""}${data.total_profit.toFixed(2)} ${summary_currency}</strong></span>
            ${mixed_currency_warning}
        </div>
    `
}

async function delete_transaction(transaction_id) {
    const response = await fetch(`/transactions/${transaction_id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
    })
    if (response.ok) {
        open_portfolio(current_portfolio_id, current_portfolio_name)
    } else {
        console.error("Błąd usuwania transakcji")
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

async function load_transactions() {
    const response = await fetch("/transactions", {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
    })
    if (!response.ok) return
    const transactions = await response.json()
    const list = document.getElementById("transactions-list")
    list.innerHTML = ""
    if (transactions.length === 0) {
        list.innerHTML = "<p>Brak transakcji.</p>"
        return
    }
    transactions.forEach(t => {
        const row = document.createElement("div")
        row.classList.add("transaction-row")
        row.innerHTML = `
            <strong>${t.ticker}</strong>
            <span>${t.transaction_type.toUpperCase()}</span>
            <span>Ilość: ${t.quantity}</span>
            <span>${t.price ? "Cena: " + t.price : "Brak ceny"}</span>
            <span>${t.transaction_date ? new Date(t.transaction_date).toLocaleDateString("pl-PL") : "Brak daty"}</span>
        `
        list.appendChild(row)
    })
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
        row.innerHTML = `<td>${u.id}</td><td>${u.username}</td>`
        tbody.appendChild(row)
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

async function add_transaction(ticker, transaction_type, quantity, price, transaction_date, portfolio_id) {
    const transactionData = {
        ticker,
        transaction_type,
        quantity: parseFloat(quantity),
        price: price ? parseFloat(price) : null,
        transaction_date: transaction_date ? transaction_date : null,
        portfolio_id: parseInt(portfolio_id)
    }

    const response = await fetch("/add-transaction", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${localStorage.getItem("token")}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(transactionData)
    })

    if (response.ok) {
        document.getElementById("add-transaction").classList.add("hidden")
        if (current_portfolio_id) {
            open_portfolio(current_portfolio_id, current_portfolio_name)
        } else {
            document.getElementById("view-transactions").classList.remove("hidden")
            load_transactions()
        }
    } else {
        const data = await response.json()
        console.error("Błąd dodawania transakcji:", data.detail)
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
    document.getElementById("view-portfolios").classList.add("hidden")
    document.getElementById("view-transactions").classList.add("hidden")
    document.getElementById("view-users").classList.add("hidden")
    document.getElementById("add-portfolio").classList.add("hidden")
    document.getElementById("add-transaction").classList.add("hidden")
    document.getElementById("view-portfolio-detail").classList.add("hidden")
}

document.getElementById("login-submit").addEventListener("click", async () => {
    const username = document.getElementById("login-username").value
    const password = document.getElementById("login-password").value
    await login(username, password)
})

document.getElementById("register-submit").addEventListener("click", async () => {
    const username = document.getElementById("register-username").value
    const password = document.getElementById("register-password").value
    await register(username, password)
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

document.getElementById("nav-users").addEventListener("click", () => {
    hide_all_views()
    document.getElementById("view-users").classList.remove("hidden")
    load_users()
})

document.getElementById("add-portfolio-btn").addEventListener("click", () => {
    document.getElementById("view-portfolios").classList.add("hidden")
    document.getElementById("add-portfolio").classList.remove("hidden")
})

document.getElementById("portfolio-submit").addEventListener("click", async () => {
    const name = document.getElementById("portfolio-name").value
    const is_public = document.getElementById("portfolio-public").checked
    await add_portfolio(name, is_public)
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
})

document.getElementById("add-transaction-detail-btn").addEventListener("click", async () => {
    document.getElementById("view-portfolio-detail").classList.add("hidden")
    document.getElementById("add-transaction").classList.remove("hidden")
    await fill_portfolio_select(current_portfolio_id)
})

document.getElementById("portfolio-detail-back").addEventListener("click", () => {
    hide_all_views()
    document.getElementById("view-portfolios").classList.remove("hidden")
    load_portfolios()
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
    await add_transaction(ticker, transaction_type, quantity, price, transaction_date, portfolio_id)
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

if (localStorage.getItem("token")) {
    document.getElementById("login").classList.add("hidden")
    document.getElementById("logged-view").classList.remove("hidden")
    load_current_user()
}
