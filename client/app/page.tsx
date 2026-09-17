"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

type ScreenKey = "login" | "dashboard" | "products" | "pos" | "history" | "summary" | "users";
type AuthMode = "login" | "signup";
type UserRole = "admin" | "business_user";

type Product = {
  id: number;
  name: string;
  category: string;
  quantity: number;
  price: number;
};

type CartItem = {
  id: number;
  name: string;
  quantity: number;
  price: number;
};

type SaleEntry = {
  id: number;
  date: string;
  time: string;
  reference: string;
  customer: string;
  payment: string;
  total: number;
};

type AuthUser = {
  id: string;
  name: string;
  email: string;
  businessName?: string;
  businessTagline?: string;
  role?: UserRole;
  createdAt: string;
};

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  businessName: string;
  businessTagline: string;
  role: UserRole;
  createdAt: string;
};

type AdminDashboardStats = {
  totalUsers: number;
  adminUsers: number;
  businessUsers: number;
  recentUsers: number;
};

const navItems = [
  { key: "dashboard", label: "Dashboard Overview" },
  { key: "products", label: "Products & Stock" },
  { key: "pos", label: "Record Sale (POS)" },
  { key: "history", label: "Sales History Log" },
  { key: "summary", label: "Sales Summary" },
] as const;

const initialProducts: Product[] = [
  { id: 1, name: "Alibongo Sugar White Bread 700g", category: "Bakery", quantity: 2, price: 18.5 },
  { id: 2, name: "Lucky Star Pilchards 400g", category: "Groceries", quantity: 1, price: 18.5 },
  { id: 3, name: "Bread Supper Black Tea 1kg", category: "Groceries", quantity: 4, price: 18.5 },
  { id: 4, name: "Organic Hair Shampoo 400ml", category: "Beauty", quantity: 6, price: 26.5 },
  { id: 5, name: "Doma Margarine 500g", category: "Bakery", quantity: 5, price: 22 },
  { id: 6, name: "Sunlight Laundry Liquid 750ml", category: "Household", quantity: 3, price: 30 },
];

const initialCart: CartItem[] = [
  { id: 1, name: "Alibongo White Bread", quantity: 2, price: 15 },
  { id: 2, name: "Lucky Star Pilchards", quantity: 3, price: 8.5 },
  { id: 3, name: "Organic Hair Shampoo", quantity: 1, price: 30 },
  { id: 4, name: "Sunlight Laundry Liquid", quantity: 2, price: 42.5 },
];

const initialHistory: SaleEntry[] = [
  { id: 1, date: "2026-03-01", time: "08:15", reference: "TRX-1062", customer: "A. Ndlovu", payment: "Cash", total: 120 },
  { id: 2, date: "2026-03-02", time: "09:40", reference: "TRX-1065", customer: "L. Mthembu", payment: "Card", total: 80 },
  { id: 3, date: "2026-03-03", time: "11:10", reference: "TRX-1071", customer: "N. van Zyl", payment: "Cash", total: 150 },
  { id: 4, date: "2026-03-04", time: "14:30", reference: "TRX-1078", customer: "S. Khumalo", payment: "Card", total: 95.5 },
];

const salesBars = [32, 52, 46, 67, 58, 78, 61, 89];
const DEMO_EMAIL = "admin@spazakeep.co.za";
const getUserDataKey = (userId?: string) => (userId ? `spazakeep-data-${userId}` : null);
const isDemoUser = (user?: AuthUser | null) => user?.email?.toLowerCase() === DEMO_EMAIL;
const isAdminUser = (user?: AuthUser | null) => user?.role === "admin" || user?.email?.toLowerCase() === DEMO_EMAIL;

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
  }).format(value);
}

export default function Home() {
  const [activeScreen, setActiveScreen] = useState<ScreenKey>("login");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [session, setSession] = useState<{ token: string; user: AuthUser } | null>(null);
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [cart, setCart] = useState<CartItem[]>(initialCart);
  const [history, setHistory] = useState<SaleEntry[]>(initialHistory);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [saleMessage, setSaleMessage] = useState("");
  const [authError, setAuthError] = useState("");
  const [isProcessingAuth, setIsProcessingAuth] = useState(false);
  const [loginForm, setLoginForm] = useState({ name: "", email: "", password: "", businessName: "", businessTagline: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: "", category: "Bakery", quantity: "1", price: "18.5" });
  const [adminUsers, setAdminUsers] = useState<ManagedUser[]>([]);
  const [adminDashboard, setAdminDashboard] = useState<AdminDashboardStats>({ totalUsers: 0, adminUsers: 0, businessUsers: 0, recentUsers: 0 });
  const [adminRecentUsers, setAdminRecentUsers] = useState<ManagedUser[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<"all" | UserRole>("all");
  const [newUserForm, setNewUserForm] = useState({ name: "", email: "", password: "", businessName: "", businessTagline: "" });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedSession = window.localStorage.getItem("spazakeep-session");
    if (!savedSession) return;

    try {
      const parsed = JSON.parse(savedSession) as { token: string; user: AuthUser };
      if (parsed?.token && parsed?.user) {
        const normalizedUser = {
          ...parsed.user,
          role: parsed.user.role || (parsed.user.email?.toLowerCase() === DEMO_EMAIL ? "admin" : "business_user"),
        };
        setSession({ ...parsed, user: normalizedUser });
        setActiveScreen("dashboard");
      }
    } catch {
      window.localStorage.removeItem("spazakeep-session");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!session) {
      window.localStorage.removeItem("spazakeep-session");
      return;
    }

    const savedUserDataKey = getUserDataKey(session.user.id);
    if (!savedUserDataKey) return;

    try {
      const savedData = window.localStorage.getItem(savedUserDataKey);
      if (savedData) {
        const parsed = JSON.parse(savedData) as { products?: Product[]; cart?: CartItem[]; history?: SaleEntry[] };
        setProducts(Array.isArray(parsed.products) ? parsed.products : isDemoUser(session.user) ? initialProducts : []);
        setCart(Array.isArray(parsed.cart) ? parsed.cart : isDemoUser(session.user) ? initialCart : []);
        setHistory(Array.isArray(parsed.history) ? parsed.history : isDemoUser(session.user) ? initialHistory : []);
      } else if (isDemoUser(session.user)) {
        setProducts(initialProducts);
        setCart(initialCart);
        setHistory(initialHistory);
      } else {
        setProducts([]);
        setCart([]);
        setHistory([]);
      }
    } catch {
      if (isDemoUser(session.user)) {
        setProducts(initialProducts);
        setCart(initialCart);
        setHistory(initialHistory);
      } else {
        setProducts([]);
        setCart([]);
        setHistory([]);
      }
      window.localStorage.removeItem(savedUserDataKey);
    }

    window.localStorage.setItem("spazakeep-session", JSON.stringify(session));
  }, [session]);

  useEffect(() => {
    if (typeof window === "undefined" || !session?.user?.id) return;

    const savedUserDataKey = getUserDataKey(session.user.id);
    if (!savedUserDataKey) return;

    const userData = { products, cart, history };
    window.localStorage.setItem(savedUserDataKey, JSON.stringify(userData));
  }, [session, products, cart, history]);

  const fetchAdminData = async () => {
    if (!session || !isAdminUser(session.user)) return;

    try {
      const [usersResponse, dashboardResponse] = await Promise.all([
        fetch(`${API_URL}/api/admin/users`, {
          headers: {
            Authorization: `Bearer ${session.token}`,
          },
        }),
        fetch(`${API_URL}/api/admin/dashboard`, {
          headers: {
            Authorization: `Bearer ${session.token}`,
          },
        }),
      ]);

      if (usersResponse.ok) {
        const usersData = (await usersResponse.json()) as { users?: ManagedUser[] };
        setAdminUsers(Array.isArray(usersData.users) ? usersData.users : []);
      }

      if (dashboardResponse.ok) {
        const dashboardData = (await dashboardResponse.json()) as {
          stats?: Partial<AdminDashboardStats>;
          recent?: ManagedUser[];
        };
        setAdminDashboard({
          totalUsers: Number(dashboardData.stats?.totalUsers || 0),
          adminUsers: Number(dashboardData.stats?.adminUsers || 0),
          businessUsers: Number(dashboardData.stats?.businessUsers || 0),
          recentUsers: Number(dashboardData.stats?.recentUsers || 0),
        });
        setAdminRecentUsers(Array.isArray(dashboardData.recent) ? dashboardData.recent : []);
      }
    } catch {
      setAdminUsers([]);
      setAdminDashboard({ totalUsers: 0, adminUsers: 0, businessUsers: 0, recentUsers: 0 });
      setAdminRecentUsers([]);
    }
  };

  useEffect(() => {
    if (!session || !isAdminUser(session.user)) return;
    fetchAdminData();
  }, [session]);

  useEffect(() => {
    if (!session || !isAdminUser(session.user) || activeScreen !== "users") return;
    fetchAdminData();
  }, [activeScreen, session]);

  const isLoggedIn = Boolean(session);

  const inventoryValue = useMemo(
    () => products.reduce((sum, product) => sum + product.quantity * product.price, 0),
    [products],
  );

  const totalRevenue = useMemo(() => history.reduce((sum, entry) => sum + entry.total, 0), [history]);
  const lowStockCount = useMemo(() => products.filter((product) => product.quantity <= 5).length, [products]);
  const recentSales = useMemo(
    () => history.slice(0, 4).map((entry) => ({ name: entry.customer, amount: formatCurrency(entry.total) })),
    [history],
  );

  const dashboardStats = [
    { label: "Total Cash on Hand", value: formatCurrency(inventoryValue || 0), note: `${products.length || 0} tracked products` },
    { label: "Transactions", value: `${history.length} Sales`, note: "Today" },
    { label: "Low Stock Items", value: `${lowStockCount} items`, note: "Requires action" },
  ];

  const quickActions = [
    "Urgent Stock Alerts",
    "Record a Sale",
    "Add New Product",
    "View Inventory Report",
  ];

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch = product.name.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === "all" || product.category === categoryFilter;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "low" && product.quantity <= 5) ||
        (statusFilter === "healthy" && product.quantity > 5);

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [products, search, categoryFilter, statusFilter]);

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = subtotal * 0.08;
  const total = subtotal + tax;

  const handleRestock = (productId: number) => {
    setProducts((current) =>
      current.map((product) =>
        product.id === productId ? { ...product, quantity: product.quantity + 1 } : product,
      ),
    );
  };

  const handleAddToCart = (product: Product) => {
    setCart((current) => {
      const existing = current.find((item) => item.name === product.name);
      if (existing) {
        return current.map((item) =>
          item.name === product.name ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }

      return [...current, { id: product.id, name: product.name, quantity: 1, price: product.price }];
    });
  };

  const handleRemoveFromCart = (itemId: number) => {
    setCart((current) => current.filter((item) => item.id !== itemId));
  };

  const handleCompleteSale = () => {
    if (!cart.length) {
      setSaleMessage("Add at least one product before completing a sale.");
      return;
    }

    const newEntry: SaleEntry = {
      id: Date.now(),
      date: new Date().toISOString().slice(0, 10),
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      reference: `TRX-${Math.floor(Math.random() * 9000 + 1000)}`,
      customer: "Walk-in Customer",
      payment: "Cash",
      total,
    };

    setHistory((current) => [newEntry, ...current]);
    setCart([]);
    setSaleMessage(`Sale ${newEntry.reference} completed successfully.`);
  };

  const handleCreateProduct = () => {
    if (!newProduct.name.trim()) {
      setSaleMessage("Please enter a product name.");
      return;
    }

    const product: Product = {
      id: Date.now(),
      name: newProduct.name.trim(),
      category: newProduct.category,
      quantity: Number(newProduct.quantity) || 0,
      price: Number(newProduct.price) || 0,
    };

    setProducts((current) => [product, ...current]);
    setNewProduct({ name: "", category: "Bakery", quantity: "1", price: "18.5" });
    setSaleMessage(`Product ${product.name} added successfully.`);
  };

  const handleAuthSubmit = async () => {
    const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/signup";
    const payload =
      authMode === "login"
        ? { email: loginForm.email, password: loginForm.password }
        : {
            name: loginForm.name,
            email: loginForm.email,
            password: loginForm.password,
            businessName: loginForm.businessName || loginForm.name,
            businessTagline: loginForm.businessTagline || "A small business",
          };

    if (authMode === "login") {
      if (!loginForm.email.trim() || !loginForm.password.trim()) {
        setAuthError("Please enter both email and password.");
        return;
      }
    } else if (!loginForm.name.trim() || !loginForm.email.trim() || !loginForm.password.trim()) {
      setAuthError("Please complete all fields to create an account.");
      return;
    }

    setIsProcessingAuth(true);
    setAuthError("");

    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as { token?: string; user?: AuthUser; message?: string };

      if (!response.ok || !data.token || !data.user) {
        throw new Error(data.message || "Authentication failed.");
      }

      setSession({ token: data.token, user: data.user });
      setActiveScreen("dashboard");
      setLoginForm({ name: "", email: "", password: "", businessName: "", businessTagline: "" });
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setIsProcessingAuth(false);
    }
  };

  const handleLogout = () => {
    setSession(null);
    setAdminUsers([]);
    setActiveScreen("login");
    setAuthMode("login");
    setLoginForm({ name: "", email: "", password: "", businessName: "", businessTagline: "" });
    setAuthError("");
  };

  const handleDeleteUser = async (userId: string) => {
    if (!session || !isAdminUser(session.user)) return;

    try {
      const response = await fetch(`${API_URL}/api/admin/users/${userId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      });

      if (!response.ok) {
        const data = (await response.json()) as { message?: string };
        throw new Error(data.message || "Unable to remove user.");
      }

      setAdminUsers((current) => current.filter((user) => user.id !== userId));
      setAdminRecentUsers((current) => current.filter((user) => user.id !== userId));
      setAdminDashboard((current) => ({
        ...current,
        totalUsers: Math.max(current.totalUsers - 1, 0),
        businessUsers: Math.max(current.businessUsers - 1, 0),
      }));
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to remove user.");
    }
  };

  const handleCreateUser = async () => {
    if (!session || !isAdminUser(session.user)) return;
    if (!newUserForm.name.trim() || !newUserForm.email.trim() || !newUserForm.password.trim()) {
      setAuthError("Please complete the name, email, and password fields.");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/admin/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          name: newUserForm.name,
          email: newUserForm.email,
          password: newUserForm.password,
          businessName: newUserForm.businessName || newUserForm.name,
          businessTagline: newUserForm.businessTagline || "A small business",
        }),
      });

      const data = (await response.json()) as { user?: ManagedUser; message?: string };
      if (!response.ok || !data.user) {
        throw new Error(data.message || "Unable to create user.");
      }

      const createdUser: ManagedUser = data.user;
      setAdminUsers((current) => [createdUser, ...current]);
      setAdminRecentUsers((current) => [createdUser, ...current].slice(0, 5));
      setAdminDashboard((current) => ({
        ...current,
        totalUsers: current.totalUsers + 1,
        businessUsers: current.businessUsers + 1,
      }));
      setNewUserForm({ name: "", email: "", password: "", businessName: "", businessTagline: "" });
      setAuthError("");
      setActiveScreen("users");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to create user.");
    }
  };

  const renderDashboard = () => (
    <>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {session?.user && isAdminUser(session.user) ? "Admin Overview" : "Dashboard Overview"}
          </h1>
          <p className="text-sm text-zinc-500">
            {session?.user && isAdminUser(session.user)
              ? "Track platform growth, user activity, and system health."
              : "Complete picture of your business performance today."}
          </p>
        </div>
        <button
          onClick={() => setActiveScreen(session?.user && isAdminUser(session.user) ? "users" : "pos")}
          className="rounded-lg bg-[#111827] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white"
        >
          {session?.user && isAdminUser(session.user) ? "Manage Users" : "New Quote Sale"}
        </button>
      </div>

      {session?.user && isAdminUser(session.user) ? (
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-[#e5e5e2] bg-white p-4 shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Total Users</p>
            <p className="mt-3 text-3xl font-bold tracking-tight">{adminDashboard.totalUsers}</p>
            <p className="mt-2 text-xs text-zinc-500">Across the platform</p>
          </div>
          <div className="rounded-xl border border-[#e5e5e2] bg-white p-4 shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Admins</p>
            <p className="mt-3 text-3xl font-bold tracking-tight">{adminDashboard.adminUsers}</p>
            <p className="mt-2 text-xs text-zinc-500">Control accounts</p>
          </div>
          <div className="rounded-xl border border-[#e5e5e2] bg-white p-4 shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Business Users</p>
            <p className="mt-3 text-3xl font-bold tracking-tight">{adminDashboard.businessUsers}</p>
            <p className="mt-2 text-xs text-zinc-500">Operational accounts</p>
          </div>
          <div className="rounded-xl border border-[#e5e5e2] bg-white p-4 shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">New in 30 Days</p>
            <p className="mt-3 text-3xl font-bold tracking-tight">{adminDashboard.recentUsers}</p>
            <p className="mt-2 text-xs text-zinc-500">Recent signups</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {dashboardStats.map((stat) => (
            <div key={stat.label} className="rounded-xl border border-[#e5e5e2] bg-white p-4 shadow-sm">
              <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">{stat.label}</p>
              <p className="mt-3 text-3xl font-bold tracking-tight">{stat.value}</p>
              <p className="mt-2 text-xs text-zinc-500">{stat.note}</p>
            </div>
          ))}
        </div>
      )}

      {session?.user && isAdminUser(session.user) ? (
        <div className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-xl border border-[#e5e5e2] bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-600">Recent Registrations</h2>
              <button onClick={() => setActiveScreen("users")} className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                View all
              </button>
            </div>

            <div className="space-y-3">
              {adminRecentUsers.length ? (
                adminRecentUsers.map((user) => (
                  <div key={user.id} className="flex items-center justify-between rounded-lg bg-[#f6f6f4] p-3">
                    <div>
                      <p className="text-sm font-medium text-zinc-800">{user.name}</p>
                      <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">{user.businessName || "Business User"}</p>
                    </div>
                    <span className="text-xs font-semibold text-zinc-600">{user.role === "admin" ? "Admin" : "Business"}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-zinc-500">No recent users yet.</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-[#e5e5e2] bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-600">Admin Actions</h2>
            <div className="mt-4 space-y-3">
              <button onClick={() => setActiveScreen("users")} className="flex w-full items-center justify-between rounded-lg bg-[#111827] px-3 py-3 text-left text-sm font-medium text-white">
                <span>Manage platform users</span>
                <span className="text-xs uppercase tracking-[0.12em]">Open</span>
              </button>
              <button onClick={() => setActiveScreen("dashboard")} className="flex w-full items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-3 text-left text-sm font-medium text-zinc-700">
                <span>Review admin overview</span>
                <span className="text-xs uppercase tracking-[0.12em]">Refresh</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-xl border border-[#e5e5e2] bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-600">Urgent Stock Alerts</h2>
              <button onClick={() => setActiveScreen("products")} className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                View all
              </button>
            </div>

            <div className="space-y-3">
              {quickActions.map((action, index) => (
                <div key={action} className="flex items-center justify-between rounded-lg bg-[#f6f6f4] p-3">
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold ${index % 2 === 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                      {index + 1}
                    </span>
                    <span className="text-sm font-medium text-zinc-700">{action}</span>
                  </div>
                  <button
                    onClick={() => setActiveScreen(index === 0 ? "products" : index === 1 ? "pos" : index === 2 ? "products" : "history")}
                    className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-700"
                  >
                    Action
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[#e5e5e2] bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-600">Recent Sales</h2>
              <button onClick={() => setActiveScreen("history")} className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Today
              </button>
            </div>

            <div className="space-y-3">
              {recentSales.map((sale, index) => (
                <div key={`${sale.name}-${index}`} className="flex items-center justify-between border-b border-[#efefec] pb-2 last:border-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#111827] text-[10px] font-bold text-white">
                      {sale.name
                        .split(" ")
                        .map((word) => word[0])
                        .slice(0, 2)
                        .join("")}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-zinc-800">{sale.name}</p>
                      <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">{index + 1} minute ago</p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-zinc-800">{sale.amount}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );

  const renderProducts = () => (
    <>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Products &amp; Stock Levels</h1>
          <p className="text-sm text-zinc-500">Manage inventory, track stock, and respond to low stock items.</p>
        </div>
        <button
          onClick={() => setActiveScreen("pos")}
          className="rounded-lg bg-[#111827] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white"
        >
          + Add New Product
        </button>
      </div>

      <div className="mb-4 grid gap-3 rounded-xl border border-[#e5e5e2] bg-white p-4 shadow-sm md:grid-cols-[1.3fr_1fr_1fr_1fr_auto]">
        <input
          value={newProduct.name}
          onChange={(event) => setNewProduct((current) => ({ ...current, name: event.target.value }))}
          placeholder="Product name"
          className="rounded-lg border border-[#e6e6e3] bg-white px-3 py-2 text-sm text-zinc-700 outline-none"
        />
        <select
          value={newProduct.category}
          onChange={(event) => setNewProduct((current) => ({ ...current, category: event.target.value }))}
          className="rounded-lg border border-[#e6e6e3] bg-white px-3 py-2 text-sm text-zinc-700 outline-none"
        >
          <option>Bakery</option>
          <option>Groceries</option>
          <option>Beauty</option>
          <option>Household</option>
        </select>
        <input
          type="number"
          min="0"
          value={newProduct.quantity}
          onChange={(event) => setNewProduct((current) => ({ ...current, quantity: event.target.value }))}
          placeholder="Qty"
          className="rounded-lg border border-[#e6e6e3] bg-white px-3 py-2 text-sm text-zinc-700 outline-none"
        />
        <input
          type="number"
          step="0.01"
          min="0"
          value={newProduct.price}
          onChange={(event) => setNewProduct((current) => ({ ...current, price: event.target.value }))}
          placeholder="Price"
          className="rounded-lg border border-[#e6e6e3] bg-white px-3 py-2 text-sm text-zinc-700 outline-none"
        />
        <button onClick={handleCreateProduct} className="rounded-lg bg-[#111827] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white">
          Add
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#e5e5e2] bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-[#efefec] bg-[#f8f8f7] p-3">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search products..."
            className="w-full max-w-[260px] rounded-lg border border-[#e6e6e3] bg-white px-3 py-2 text-sm text-zinc-700 outline-none"
          />
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="rounded-lg border border-[#e6e6e3] bg-white px-3 py-2 text-sm text-zinc-700 outline-none"
          >
            <option value="all">Category: All</option>
            {Array.from(new Set(products.map((product) => product.category))).map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-lg border border-[#e6e6e3] bg-white px-3 py-2 text-sm text-zinc-700 outline-none"
          >
            <option value="all">Status: All</option>
            <option value="low">Low Stock</option>
            <option value="healthy">Healthy Stock</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="bg-[#f2f2f0] text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                <th className="px-4 py-3 font-semibold">Product</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold">Qty</th>
                <th className="px-4 py-3 font-semibold">Price</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => (
                <tr key={product.id} className="border-t border-[#f0f0ee]">
                  <td className="px-4 py-3 text-zinc-700">{product.name}</td>
                  <td className="px-4 py-3 text-zinc-500">{product.category}</td>
                  <td className="px-4 py-3 text-zinc-700">{product.quantity} units</td>
                  <td className="px-4 py-3 text-zinc-700">{formatCurrency(product.price)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${product.quantity <= 5 ? "bg-orange-100 text-orange-700" : "bg-emerald-100 text-emerald-700"}`}>
                      {product.quantity <= 5 ? "Low Stock" : "In Stock"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleRestock(product.id)}
                      className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-700"
                    >
                      Restock
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );

  const renderPos = () => (
    <>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Customer Sale</h1>
          <p className="text-sm text-zinc-500">Create a quick receipt with product quantities and pricing.</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-[#e5e5e2] bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-600">Quick Select Products</h2>
            <button onClick={() => setActiveScreen("products")} className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Add item
            </button>
          </div>

          <div className="space-y-3">
            {products.slice(0, 6).map((product) => (
              <div key={product.id} className="flex items-center justify-between gap-3 rounded-lg bg-[#f8f8f6] p-3 text-sm">
                <div>
                  <p className="font-medium text-zinc-800">{product.name}</p>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">{product.quantity} in stock</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-zinc-700">{formatCurrency(product.price)}</span>
                  <button
                    onClick={() => handleAddToCart(product)}
                    className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-700"
                  >
                    Add
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[#e5e5e2] bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-600">Order Summary</h2>

          <div className="mt-4 space-y-3 text-sm text-zinc-700">
            {cart.length ? (
              cart.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3">
                  <div>
                    <span>{item.name}</span>
                    <span className="ml-2 text-zinc-500">x{item.quantity}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>{formatCurrency(item.price * item.quantity)}</span>
                    <button onClick={() => handleRemoveFromCart(item.id)} className="text-[10px] font-semibold uppercase tracking-[0.12em] text-red-600">
                      Remove
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-zinc-500">No items in cart yet.</p>
            )}
          </div>

          <div className="mt-4 border-t border-[#efefec] pt-4">
            <div className="flex items-center justify-between text-sm text-zinc-700">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm text-zinc-700">
              <span>Tax</span>
              <span>{formatCurrency(tax)}</span>
            </div>
            <div className="mt-3 flex items-center justify-between text-lg font-bold text-zinc-900">
              <span>Total Due</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>

          {saleMessage ? <p className="mt-3 text-xs font-medium text-emerald-600">{saleMessage}</p> : null}

          <button onClick={handleCompleteSale} className="mt-5 w-full rounded-lg bg-[#111827] px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-white">
            Complete Sale &amp; Print Receipt
          </button>
        </div>
      </div>
    </>
  );

  const renderHistory = () => (
    <>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sales History Log</h1>
          <p className="text-sm text-zinc-500">Track every transaction, payment type, and cash movement.</p>
        </div>
        <button onClick={() => setActiveScreen("summary")} className="rounded-lg bg-[#111827] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white">
          Export CSV
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#e5e5e2] bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#efefec] bg-[#f8f8f7] p-3">
          <div className="flex gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
            <span className="rounded-md border border-zinc-200 bg-white px-2 py-1">All dates</span>
            <span className="rounded-md border border-zinc-200 bg-white px-2 py-1">Payment Type</span>
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Total Sales: {formatCurrency(history.reduce((sum, entry) => sum + entry.total, 0))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="bg-[#f2f2f0] text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Time</th>
                <th className="px-4 py-3 font-semibold">Ref.</th>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Payment</th>
                <th className="px-4 py-3 font-semibold text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.id} className="border-t border-[#f0f0ee]">
                  <td className="px-4 py-3 text-zinc-700">{row.date}</td>
                  <td className="px-4 py-3 text-zinc-700">{row.time}</td>
                  <td className="px-4 py-3 text-zinc-700">{row.reference}</td>
                  <td className="px-4 py-3 text-zinc-700">{row.customer}</td>
                  <td className="px-4 py-3 text-zinc-700">{row.payment}</td>
                  <td className="px-4 py-3 text-right font-semibold text-zinc-900">{formatCurrency(row.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );

  const renderUsers = () => {
    const filteredUsers = adminUsers.filter((user) => {
      const matchesSearch =
        user.name.toLowerCase().includes(userSearch.toLowerCase()) ||
        user.email.toLowerCase().includes(userSearch.toLowerCase()) ||
        (user.businessName || "").toLowerCase().includes(userSearch.toLowerCase());

      const matchesFilter = userRoleFilter === "all" || user.role === userRoleFilter;
      return matchesSearch && matchesFilter;
    });

    return (
      <>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
            <p className="text-sm text-zinc-500">Admin view for managing registered business users.</p>
          </div>
        </div>

        <div className="mb-5 grid gap-4 rounded-xl border border-[#e5e5e2] bg-white p-4 shadow-sm lg:grid-cols-[1.2fr_1fr_1fr_1fr_auto]">
          <input
            value={newUserForm.name}
            onChange={(event) => setNewUserForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="Full name"
            className="rounded-lg border border-[#e6e6e3] bg-[#f7f7f5] px-3 py-2.5 text-sm text-zinc-700 outline-none"
          />
          <input
            value={newUserForm.businessName}
            onChange={(event) => setNewUserForm((current) => ({ ...current, businessName: event.target.value }))}
            placeholder="Business name"
            className="rounded-lg border border-[#e6e6e3] bg-[#f7f7f5] px-3 py-2.5 text-sm text-zinc-700 outline-none"
          />
          <input
            type="email"
            value={newUserForm.email}
            onChange={(event) => setNewUserForm((current) => ({ ...current, email: event.target.value }))}
            placeholder="user@email.com"
            className="rounded-lg border border-[#e6e6e3] bg-[#f7f7f5] px-3 py-2.5 text-sm text-zinc-700 outline-none"
          />
          <input
            type="password"
            value={newUserForm.password}
            onChange={(event) => setNewUserForm((current) => ({ ...current, password: event.target.value }))}
            placeholder="Password"
            className="rounded-lg border border-[#e6e6e3] bg-[#f7f7f5] px-3 py-2.5 text-sm text-zinc-700 outline-none"
          />
          <button
            type="button"
            onClick={handleCreateUser}
            className="rounded-lg bg-[#111827] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white"
          >
            Create User
          </button>
        </div>

        <div className="mb-5 flex flex-col gap-3 rounded-xl border border-[#e5e5e2] bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
          <input
            value={userSearch}
            onChange={(event) => setUserSearch(event.target.value)}
            placeholder="Search users by name, business, or email"
            className="w-full rounded-lg border border-[#e6e6e3] bg-[#f7f7f5] px-3 py-2.5 text-sm text-zinc-700 outline-none md:max-w-md"
          />
          <select
            value={userRoleFilter}
            onChange={(event) => setUserRoleFilter(event.target.value as "all" | UserRole)}
            className="rounded-lg border border-[#e6e6e3] bg-[#f7f7f5] px-3 py-2.5 text-sm text-zinc-700 outline-none"
          >
            <option value="all">All roles</option>
            <option value="admin">Admin</option>
            <option value="business_user">Business user</option>
          </select>
        </div>

        <div className="overflow-hidden rounded-xl border border-[#e5e5e2] bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="bg-[#f2f2f0] text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Business</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length ? (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="border-t border-[#f0f0ee]">
                      <td className="px-4 py-3 text-zinc-700">{user.name}</td>
                      <td className="px-4 py-3 text-zinc-700">{user.businessName || "Unknown"}</td>
                      <td className="px-4 py-3 text-zinc-700">{user.email}</td>
                      <td className="px-4 py-3 text-zinc-700">{user.role === "admin" ? "Admin" : "Business User"}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(user.id)}
                          disabled={user.email.toLowerCase() === DEMO_EMAIL}
                          className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {user.email.toLowerCase() === DEMO_EMAIL ? "Protected" : "Delete"}
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                      No users match the current filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </>
    );
  };

  const renderSummary = () => (
    <>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Business Summary</h1>
          <p className="text-sm text-zinc-500">Track your sales performance and key business trends.</p>
        </div>
        <div className="flex gap-2">
          <button className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-700">
            This Week
          </button>
          <button className="rounded-lg bg-[#111827] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">
            Last 30 Days
          </button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-xl border border-[#e5e5e2] bg-white p-4 shadow-sm">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Total Revenue</p>
              <p className="mt-2 text-3xl font-bold">{formatCurrency(totalRevenue || 0)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Items Sold</p>
              <p className="mt-2 text-3xl font-bold">{history.length || 0} Sales</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Growth</p>
              <p className="mt-2 text-3xl font-bold text-emerald-600">{history.length > 0 ? "+12.3%" : "0.0%"}</p>
            </div>
          </div>

          <div className="mt-6 flex h-44 items-end gap-3 rounded-xl bg-[#f7f7f6] p-4">
            {salesBars.map((height, index) => (
              <div key={`${height}-${index}`} className="flex flex-1 flex-col items-center justify-end">
                <div
                  className={`w-full rounded-t-md ${index % 2 === 0 ? "bg-[#171c22]" : "bg-[#2d333b]"}`}
                  style={{ height: `${height}%` }}
                />
                <span className="mt-2 text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                  {[
                    "Mon",
                    "Tue",
                    "Wed",
                    "Thu",
                    "Fri",
                    "Sat",
                    "Sun",
                    "Avg",
                  ][index]}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[#e5e5e2] bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-600">Top Performing Products</h2>

          <div className="mt-4 space-y-3">
            {[...products]
              .sort((a, b) => b.quantity * b.price - a.quantity * a.price)
              .slice(0, 3)
              .map((product, index) => (
                <div key={`${product.name}-${index}`} className="flex items-center justify-between rounded-lg bg-[#f7f7f5] p-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-800">{product.name}</p>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Fast moving stock</p>
                  </div>
                  <span className="text-sm font-bold text-zinc-900">{formatCurrency(product.quantity * product.price)}</span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </>
  );

  const viewMap: Record<ScreenKey, ReactNode> = {
    login: null,
    dashboard: renderDashboard(),
    products: renderProducts(),
    pos: renderPos(),
    history: renderHistory(),
    summary: renderSummary(),
    users: renderUsers(),
  };

  if (!isLoggedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#191b1d] p-6">
        <div className="grid w-full max-w-5xl overflow-hidden rounded-[22px] border border-[#2b2d31] bg-[#f3f3f1] shadow-[0_20px_70px_rgba(0,0,0,0.28)] lg:grid-cols-[1.1fr_0.9fr]">
          <div className="bg-[#111214] p-8 text-white">
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-sm font-bold text-[#111214]">S</div>
              <div>
                <p className="mt-1 text-[10px] uppercase tracking-[0.24em] text-zinc-400">Small Business Inventory Sales Tracker</p>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-400">Welcome</p>
                <h1 className="mt-2 text-4xl font-bold tracking-tight">Run your shop with clarity.</h1>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
                <p className="text-sm text-zinc-300">Track stock, record sales, and monitor cash flow from one reliable dashboard.</p>
                <div className="mt-5 grid gap-3 text-sm text-zinc-200">
                  <div className="flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full bg-emerald-400" /> Real-time inventory checks</div>
                  <div className="flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full bg-emerald-400" /> Fast POS sales capture</div>
                  <div className="flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full bg-emerald-400" /> Business summary and trend reports</div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center p-8">
            <div className="w-full max-w-md rounded-[20px] border border-[#e5e5e2] bg-white p-6 shadow-sm">
              <div className="mb-6">
                <div className="flex rounded-lg border border-[#e5e5e2] bg-[#f7f7f5] p-1">
                  <button
                    type="button"
                    onClick={() => setAuthMode("login")}
                    className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
                      authMode === "login" ? "bg-[#111827] text-white" : "text-zinc-600"
                    }`}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthMode("signup")}
                    className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
                      authMode === "signup" ? "bg-[#111827] text-white" : "text-zinc-600"
                    }`}
                  >
                    Sign up
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {authMode === "signup" ? (
                  <>
                    <div>
                      <label htmlFor="name" className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                        Full name
                      </label>
                      <input
                        id="name"
                        type="text"
                        value={loginForm.name}
                        onChange={(event) => setLoginForm((current) => ({ ...current, name: event.target.value }))}
                        placeholder="Your name"
                        className="w-full rounded-lg border border-[#e5e5e2] bg-[#f7f7f5] px-3 py-3 text-sm text-zinc-800 outline-none focus:border-[#111827]"
                      />
                    </div>

                    <div>
                      <label htmlFor="businessName" className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                        Business name
                      </label>
                      <input
                        id="businessName"
                        type="text"
                        value={loginForm.businessName}
                        onChange={(event) => setLoginForm((current) => ({ ...current, businessName: event.target.value }))}
                        placeholder="Your shop or business name"
                        className="w-full rounded-lg border border-[#e5e5e2] bg-[#f7f7f5] px-3 py-3 text-sm text-zinc-800 outline-none focus:border-[#111827]"
                      />
                    </div>

                    <div>
                      <label htmlFor="businessTagline" className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                        Business tagline
                      </label>
                      <input
                        id="businessTagline"
                        type="text"
                        value={loginForm.businessTagline}
                        onChange={(event) => setLoginForm((current) => ({ ...current, businessTagline: event.target.value }))}
                        placeholder="A small business"
                        className="w-full rounded-lg border border-[#e5e5e2] bg-[#f7f7f5] px-3 py-3 text-sm text-zinc-800 outline-none focus:border-[#111827]"
                      />
                    </div>
                  </>
                ) : null}

                <div>
                  <label htmlFor="email" className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={loginForm.email}
                    onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))}
                    placeholder="admin@spazakeep.co.za"
                    className="w-full rounded-lg border border-[#e5e5e2] bg-[#f7f7f5] px-3 py-3 text-sm text-zinc-800 outline-none focus:border-[#111827]"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={loginForm.password}
                      onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                      placeholder="••••••••"
                      className="w-full rounded-lg border border-[#e5e5e2] bg-[#f7f7f5] px-3 py-3 pr-11 text-sm text-zinc-800 outline-none focus:border-[#111827]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      className="absolute inset-y-0 right-3 flex items-center text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-600"
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                {authError ? <p className="text-sm text-red-600">{authError}</p> : null}

                <button
                  type="button"
                  onClick={handleAuthSubmit}
                  disabled={isProcessingAuth}
                  className="w-full rounded-lg bg-[#111827] px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-white disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isProcessingAuth ? "Please wait..." : authMode === "login" ? "Login to dashboard" : "Create account"}
                </button>

              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentBusinessName = session?.user?.businessName?.trim() || session?.user?.name?.trim() || "SpazaKeep";
  const currentBusinessTagline = session?.user?.businessTagline?.trim() || "A small business";
  const navigationItems: Array<{ key: ScreenKey; label: string }> = session?.user && isAdminUser(session.user)
    ? [
        ...navItems,
        { key: "users", label: "Manage Users" },
      ]
    : navItems.map((item) => ({ key: item.key as ScreenKey, label: item.label }));

  return (
    <div className="min-h-screen bg-[#191b1d] px-4 py-5 text-[#111827]">
      <div className="mx-auto max-w-[1300px]">
        <section className="rounded-[18px] border border-[#24262a] bg-[#f3f3f1] shadow-[0_20px_40px_rgba(0,0,0,0.18)]">
          <div className="grid min-h-[520px] grid-cols-[220px_1fr] bg-[#f5f5f3]">
            <aside className="border-r border-[#deded8] bg-[#f0f0ee] p-4">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0d0d0d] text-xs font-bold text-white">{currentBusinessName.charAt(0).toUpperCase() || "S"}</div>
                <div>
                  <p className="text-lg font-bold leading-none">{currentBusinessName}</p>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Small Business Inventory Sales Tracker</p>
                </div>
              </div>

              <nav className="space-y-2">
                {navigationItems.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setActiveScreen(item.key)}
                    className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                      activeScreen === item.key ? "bg-[#111827] text-white shadow-sm" : "text-zinc-700 hover:bg-white hover:text-zinc-900"
                    }`}
                  >
                    <span className="mr-2 inline-block h-2 w-2 rounded-full bg-current opacity-80" />
                    {item.label}
                  </button>
                ))}
              </nav>

              <button
                onClick={handleLogout}
                className="mt-8 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-700"
              >
                Logout
              </button>
            </aside>

            <main className="p-5">{viewMap[activeScreen]}</main>
          </div>
        </section>
      </div>
    </div>
  );
}
