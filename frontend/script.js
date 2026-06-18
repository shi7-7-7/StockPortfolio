async function login(username, password) {
    const formData = new FormData()
    formData.append("username", username)
    formData.append("password", password)

    const response = await fetch("/login", {
        method: "POST",
        body: formData
    })

    if (response.ok) {
        const data = await response.json();
        localStorage.setItem("token", data.access_token);
        document.getElementById("login").classList.add("hidden");
        document.getElementById("register").classList.add("hidden");
        document.getElementById("logged-view").classList.remove("hidden")
    } else {
        console.error("Błędny login/hasło")
    }
}

async function register(username, password) {

    const userData = {
        username : username,
        password : password
    }

    const response = await fetch("/create-user", {
        method: "POST",
        headers: {
            "Content-Type" : "application/json"
        },
        body: JSON.stringify(userData)
    });

    if (response.ok) {
        await login(userData.username, userData.password)
    } else {
        console.error("Błąd z rejestracją - użytkownik jest już w bazie");
    }


}

async function add_portfolio(name, is_public) {

    const portfolioData = {
        name: name,
        is_public: is_public
    }

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
    }
}

function logout() {
    localStorage.removeItem("token")
    document.getElementById("logged-view").classList.add("hidden")
    document.getElementById("login").classList.remove("hidden")
}

document.getElementById("login-submit").addEventListener("click", async() => {
    const username = document.getElementById("login-username").value
    const password = document.getElementById("login-password").value
    
    await login(username, password)
    
})

document.getElementById("register-submit").addEventListener("click", async() => {
    const username = document.getElementById("register-username").value
    const password = document.getElementById("register-password").value
    
    await register(username, password)
})

document.getElementById("login-page").addEventListener("click", async() => {
    document.getElementById("register").classList.add("hidden")
    document.getElementById("login").classList.remove("hidden")
})

document.getElementById("register-page").addEventListener("click", async() => {
    document.getElementById("login").classList.add("hidden")
    document.getElementById("register").classList.remove("hidden")
})

document.getElementById("logout").addEventListener("click", logout)

function hideAllViews() {
    document.getElementById("view-portfolios").classList.add("hidden")
    document.getElementById("view-transactions").classList.add("hidden")
    document.getElementById("view-users").classList.add("hidden")
    document.getElementById("add-portfolio").classList.add("hidden")
    document.getElementById("add-transaction").classList.add("hidden")
}

document.getElementById("nav-portfolios").addEventListener("click", () => {
    hideAllViews()
    document.getElementById("view-portfolios").classList.remove("hidden")
})

document.getElementById("nav-transactions").addEventListener("click", () => {
    hideAllViews()
    document.getElementById("view-transactions").classList.remove("hidden")
})

document.getElementById("nav-users").addEventListener("click", () => {
    hideAllViews()
    document.getElementById("view-users").classList.remove("hidden")
})

document.getElementById("add-portfolio-btn").addEventListener("click", () => {
    document.getElementById("view-portfolios").classList.add("hidden")
    document.getElementById("add-portfolio").classList.remove("hidden")
})

document.getElementById("portfolio-submit").addEventListener("click", async() => {
    const name = document.getElementById("portfolio-name").value
    const is_public = document.getElementById("portfolio-public").checked
    await add_portfolio(name, is_public)
})

document.getElementById("portfolio-cancel").addEventListener("click", () => {
    document.getElementById("add-portfolio").classList.add("hidden")
    document.getElementById("view-portfolios").classList.remove("hidden")
})

document.getElementById("add-transaction-btn").addEventListener("click", () => {
    document.getElementById("view-transactions").classList.add("hidden")
    document.getElementById("add-transaction").classList.remove("hidden")
})

document.getElementById("transaction-cancel").addEventListener("click", () => {
    document.getElementById("add-transaction").classList.add("hidden")
    document.getElementById("view-transactions").classList.remove("hidden")
})

async function add_transaction(ticker, transaction_type, quantity, price, transaction_date, portfolio_id) {
    const transactionData = {
        ticker: ticker,
        transaction_type: transaction_type,
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
        document.getElementById("view-transactions").classList.remove("hidden")
    } else {
        const data = await response.json()
        console.error("Błąd dodawania transakcji:", data.detail)
    }
}

document.getElementById("transaction-submit").addEventListener("click", async() => {
    const ticker = document.getElementById("transaction-ticker").value
    const transaction_type = document.getElementById("transaction-type").value
    const quantity = document.getElementById("transaction-quantity").value
    const price = document.getElementById("transaction-price").value
    const transaction_date = document.getElementById("transaction-date").value
    const portfolio_id = document.getElementById("transaction-portfolio-id").value

    await add_transaction(ticker, transaction_type, quantity, price, transaction_date, portfolio_id)
})
document.getElementById("transaction-ticker").addEventListener("input", async() => {
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
    document.getElementById("login").classList.add("hidden");
    document.getElementById("logged-view").classList.remove("hidden");
}
