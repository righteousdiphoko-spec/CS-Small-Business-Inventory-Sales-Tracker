"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";

const API_URL = "";

type ScreenKey = "login" | "dashboard" | "products" | "pos" | "history" | "summary" | "losses" | "users";
type AuthMode = "login" | "signup" | "forgot-password" | "forgot-email" | "reset-password";
type UserRole = "admin" | "business_user";

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

type ReportSummary = {
  revenue: number;
  cost: number;
  grossProfit: number;
  inventoryLosses: number;
  profit: number;
  transactions: number;
  topProducts: Array<{ name: string; quantity: number; value: number; profit: number }>;
  lossSummary: LossSummary;
};

type LossReason = "Damaged" | "Expired" | "Lost" | "Stolen" | "Spoiled" | "Written Off" | "Other";

type LossEntry = {
  id: string;
  productId: string | null;
  productName: string;
  quantity: number;
  costPrice: number;
  lossAmount: number;
  reason: LossReason;
  date: string;
  notes: string;
  createdAt: string;
};

type LossSummary = {
  total: number;
  today: number;
  thisWeek: number;
  thisMonth: number;
  transactions: number;
  topProducts: Array<{ name: string; quantity: number; amount: number }>;
  trend: Array<{ date: string; amount: number }>;
};

const LOSS_REASONS: LossReason[] = ["Damaged", "Expired", "Lost", "Stolen", "Spoiled", "Written Off", "Other"];

const EMPTY_REPORT_SUMMARY: ReportSummary = {
  revenue: 0,
  cost: 0,
  grossProfit: 0,
  inventoryLosses: 0,
  profit: 0,
  transactions: 0,
  topProducts: [],
  lossSummary: { total: 0, today: 0, thisWeek: 0, thisMonth: 0, transactions: 0, topProducts: [], trend: [] },
};

function getTodayDateInput() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function normalizeReportSummary(data: Partial<ReportSummary>): ReportSummary {
  return {
    revenue: Number(data.revenue || 0),
    cost: Number(data.cost || 0),
    grossProfit: Number(data.grossProfit ?? data.profit ?? 0),
    inventoryLosses: Number(data.inventoryLosses || 0),
    profit: Number(data.profit || 0),
    transactions: Number(data.transactions || 0),
    topProducts: Array.isArray(data.topProducts) ? data.topProducts : [],
    lossSummary: {
      total: Number(data.lossSummary?.total || 0),
      today: Number(data.lossSummary?.today || 0),
      thisWeek: Number(data.lossSummary?.thisWeek || 0),
      thisMonth: Number(data.lossSummary?.thisMonth || 0),
      transactions: Number(data.lossSummary?.transactions || 0),
      topProducts: Array.isArray(data.lossSummary?.topProducts) ? data.lossSummary.topProducts : [],
      trend: Array.isArray(data.lossSummary?.trend) ? data.lossSummary.trend : [],
    },
  };
}

const navItems = [
  { key: "dashboard", label: "Dashboard Overview" },
  { key: "products", label: "Products & Stock" },
  { key: "losses", label: "Loss History" },
  { key: "pos", label: "Record Sale (POS)" },
  { key: "history", label: "Sales History Log" },
  { key: "summary", label: "Sales Summary" },
] as const;

type Product = {
  id: string | number;
  name: string;
  category: string;
  quantity: number;
  price: number;
  costPrice: number | null;
};

type CartItem = {
  id: string | number;
  name: string;
  quantity: number;
  price: number;
  costPrice: number | null;
};

type SaleEntry = {
  id: string | number;
  date: string;
  time: string;
  reference: string;
  customer: string;
  payment: string;
  total: number;
  totalCost: number;
  totalProfit: number;
};

const isAdminUser = (user?: AuthUser | null) => user?.role === "admin";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
  }).format(value);
}

async function parseApiResponse<T>(response: Response, serviceName: string): Promise<T> {
  const responseText = await response.text();
  try {
    return JSON.parse(responseText) as T;
  } catch {
    throw new Error(`${serviceName} returned an invalid response (${response.status}). Check the API/database connection and retry.`);
  }
}

export default function Home() {
  const [activeScreen, setActiveScreen] = useState<ScreenKey>("login");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [session, setSession] = useState<{ token: string; user: AuthUser } | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [history, setHistory] = useState<SaleEntry[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [saleMessage, setSaleMessage] = useState("");
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [isProcessingAuth, setIsProcessingAuth] = useState(false);
  const [loginForm, setLoginForm] = useState({ name: "", email: "", password: "", businessName: "", businessTagline: "" });
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryDetails, setRecoveryDetails] = useState({ name: "", businessName: "" });
  const [resetPasswords, setResetPasswords] = useState({ password: "", confirmPassword: "" });
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [recoveryError, setRecoveryError] = useState("");
  const [recoveryPending, setRecoveryPending] = useState(false);
  const [resetToken, setResetToken] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: "", category: "Bakery", quantity: "1", price: "18.5", costPrice: "" });
  const [editingProductId, setEditingProductId] = useState<string | number | null>(null);
  const [productMessage, setProductMessage] = useState("");
  const [productMessageType, setProductMessageType] = useState<"error" | "success">("error");
  const [productPending, setProductPending] = useState(false);
  const [adminUsers, setAdminUsers] = useState<ManagedUser[]>([]);
  const [adminDashboard, setAdminDashboard] = useState<AdminDashboardStats>({ totalUsers: 0, adminUsers: 0, businessUsers: 0, recentUsers: 0 });
  const [adminRecentUsers, setAdminRecentUsers] = useState<ManagedUser[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<"all" | UserRole>("all");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingUserForm, setEditingUserForm] = useState({ name: "", businessName: "", businessTagline: "" });
  const [reportSummary, setReportSummary] = useState<ReportSummary>(EMPTY_REPORT_SUMMARY);
  const [losses, setLosses] = useState<LossEntry[]>([]);
  const [lossLoading, setLossLoading] = useState(false);
  const [lossPending, setLossPending] = useState(false);
  const [lossError, setLossError] = useState("");
  const [lossMessage, setLossMessage] = useState("");
  const [lossModalOpen, setLossModalOpen] = useState(false);
  const [lossForm, setLossForm] = useState({ productId: "", quantity: "1", reason: "Damaged" as LossReason, date: getTodayDateInput(), notes: "" });
  const [lossFilters, setLossFilters] = useState({ from: "", to: "", productId: "all", reason: "all" });
  const [lossRange, setLossRange] = useState<"all" | "week" | "month">("all");

  useEffect(() => {
    if (typeof window !== "undefined" && session) {
      window.localStorage.setItem("spazakeep-session", JSON.stringify(session));
    }
  }, [session]);

  useEffect(() => {
    setProducts([]);
    setCart([]);
    setHistory([]);
    setLosses([]);
    setReportSummary(EMPTY_REPORT_SUMMARY);
    setSaleMessage("");
    setLossError("");
    setLossMessage("");

    if (!session || isAdminUser(session.user)) return;

    let cancelled = false;

    const loadBusinessData = async () => {
      setLossLoading(true);
      try {
        const headers = { Authorization: `Bearer ${session.token}` };
        const [productsResponse, salesResponse, reportResponse, lossesResponse] = await Promise.all([
          fetch(`${API_URL}/api/products`, { headers }),
          fetch(`${API_URL}/api/sales`, { headers }),
          fetch(`${API_URL}/api/reports/summary`, { headers }),
          fetch(`${API_URL}/api/losses`, { headers }),
        ]);
        if (!productsResponse.ok || !salesResponse.ok || !reportResponse.ok || !lossesResponse.ok) throw new Error("Unable to load business data.");

        const productsData = (await productsResponse.json()) as { products?: Product[] };
        const salesData = (await salesResponse.json()) as { sales?: Array<{ id: string; reference: string; customer: string; payment: string; total: number; totalCost?: number; totalProfit?: number; createdAt: string }> };
        const reportData = (await reportResponse.json()) as Partial<ReportSummary>;
        const lossesData = (await lossesResponse.json()) as { losses?: LossEntry[] };
        if (cancelled) return;
        setProducts(Array.isArray(productsData.products) ? productsData.products : []);
        setLosses(Array.isArray(lossesData.losses) ? lossesData.losses : []);
        setHistory(Array.isArray(salesData.sales) ? salesData.sales.map((sale) => {
          const createdAt = new Date(sale.createdAt);
          return {
            id: sale.id,
            date: createdAt.toISOString().slice(0, 10),
            time: createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            reference: sale.reference,
            customer: sale.customer,
            payment: sale.payment,
            total: Number(sale.total),
            totalCost: Number(sale.totalCost || 0),
            totalProfit: Number(sale.totalProfit || 0),
          };
        }) : []);
        setCart([]);
        setReportSummary(normalizeReportSummary(reportData));
      } catch (error) {
        if (!cancelled) {
          setAuthError(error instanceof Error ? error.message : "Unable to load business data.");
          setLossError("Unable to load inventory loss data.");
        }
      } finally {
        if (!cancelled) setLossLoading(false);
      }
    };

    loadBusinessData();
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const fragmentParams = new URLSearchParams(window.location.hash.slice(1));
    const token = fragmentParams.get("resetToken") || params.get("resetToken");
    if (token) {
      window.history.replaceState({}, "", window.location.pathname);
      window.localStorage.removeItem("spazakeep-session");
      queueMicrotask(() => {
        setResetToken(token);
        setAuthMode("reset-password");
      });
      return;
    }

    const savedSession = window.localStorage.getItem("spazakeep-session");
    if (!savedSession) return;

    try {
      const parsed = JSON.parse(savedSession) as { token: string; user: AuthUser };
      if (parsed?.token && parsed?.user) {
        fetch(`${API_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${parsed.token}` },
        })
          .then(async (response) => {
            if (!response.ok) throw new Error("Session expired.");
            const data = (await response.json()) as { user?: AuthUser };
            if (!data.user) throw new Error("Session user is unavailable.");
            setSession({ token: parsed.token, user: data.user });
            setActiveScreen("dashboard");
          })
          .catch(() => {
            window.localStorage.removeItem("spazakeep-session");
          });
      }
    } catch {
      window.localStorage.removeItem("spazakeep-session");
    }
  }, []);

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

  useEffect(() => {
    if (!session || isAdminUser(session.user) || (activeScreen !== "products" && activeScreen !== "losses")) return;
    let cancelled = false;

    const loadProducts = async () => {
      try {
        const response = await fetch(`${API_URL}/api/products`, {
          headers: { Authorization: `Bearer ${session.token}` },
        });
        const data = (await response.json()) as { products?: Product[]; message?: string };
        if (!response.ok) throw new Error(data.message || "Unable to load products from the database.");
        if (!cancelled) setProducts(Array.isArray(data.products) ? data.products : []);
      } catch (error) {
        if (!cancelled) {
          setProductMessage(error instanceof Error ? error.message : "Unable to load products from the database.");
          setProductMessageType("error");
        }
      }
    };

    void loadProducts();
    return () => {
      cancelled = true;
    };
  }, [activeScreen, session]);

  const isLoggedIn = Boolean(session);

  const currentBusinessName = session?.user?.businessName?.trim() || session?.user?.name?.trim() || "Business";
  const currentBusinessTagline = session?.user?.businessTagline?.trim() || "A small business";

  useEffect(() => {
    document.title = session ? `${currentBusinessName} Dashboard` : "Business Dashboard";
  }, [session, currentBusinessName]);

  const inventoryValue = useMemo(
    () => products.reduce((sum, product) => sum + product.quantity * product.price, 0),
    [products],
  );

  const lowStockCount = useMemo(() => products.filter((product) => product.quantity <= 5).length, [products]);
  const recentSales = useMemo(
    () => history.slice(0, 4).map((entry) => ({ name: entry.customer, amount: formatCurrency(entry.total) })),
    [history],
  );
  const salesBars = useMemo(() => {
    const dailyTotals = new Map<string, number>();
    history.forEach((entry) => dailyTotals.set(entry.date, (dailyTotals.get(entry.date) || 0) + entry.total));
    const values = Array.from(dailyTotals.values()).slice(-8);
    const maximum = Math.max(...values, 0);
    return Array.from({ length: 8 }, (_, index) => {
      const value = values[index - (8 - values.length)] || 0;
      return maximum ? Math.max((value / maximum) * 100, 4) : 0;
    });
  }, [history]);

  const dashboardStats = [
    { label: "Total Cash on Hand", value: formatCurrency(inventoryValue || 0), note: `${products.length || 0} tracked products` },
    { label: "Transactions", value: `${history.length} Sales`, note: "Today" },
    { label: "Low Stock Items", value: `${lowStockCount} items`, note: "Requires action" },
    { label: "Net Profit", value: formatCurrency(reportSummary.profit), note: "After inventory losses" },
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
  const selectedLossProduct = products.find((product) => String(product.id) === lossForm.productId);
  const lossQuantity = Number(lossForm.quantity);
  const estimatedLoss = selectedLossProduct?.costPrice === null || !selectedLossProduct
    ? 0
    : Number((lossQuantity * selectedLossProduct.costPrice).toFixed(2));
  const filteredLosses = losses.filter((loss) => {
    const matchesFrom = !lossFilters.from || loss.date >= lossFilters.from;
    const matchesTo = !lossFilters.to || loss.date <= lossFilters.to;
    const matchesProduct = lossFilters.productId === "all" || String(loss.productId) === lossFilters.productId;
    const matchesReason = lossFilters.reason === "all" || loss.reason === lossFilters.reason;
    return matchesFrom && matchesTo && matchesProduct && matchesReason;
  });
  const lossBars = reportSummary.lossSummary.trend.map((day) => {
    const maximum = Math.max(...reportSummary.lossSummary.trend.map((entry) => entry.amount), 0);
    return { ...day, height: maximum ? Math.max((day.amount / maximum) * 100, 4) : 0 };
  });

  const lossMetrics = {
    all: [
      { label: "Total loss", value: formatCurrency(reportSummary.lossSummary.total) },
      { label: "Today", value: formatCurrency(reportSummary.lossSummary.today) },
      { label: "This week", value: formatCurrency(reportSummary.lossSummary.thisWeek) },
      { label: "This month", value: formatCurrency(reportSummary.lossSummary.thisMonth) },
    ],
    week: [
      { label: "Weekly loss", value: formatCurrency(reportSummary.lossSummary.thisWeek) },
      { label: "Transactions", value: `${reportSummary.lossSummary.transactions} losses` },
      { label: "Top reason", value: reportSummary.lossSummary.topProducts[0]?.name || "No losses" },
    ],
    month: [
      { label: "Monthly loss", value: formatCurrency(reportSummary.lossSummary.thisMonth) },
      { label: "Transactions", value: `${reportSummary.lossSummary.transactions} losses` },
      { label: "Tracked products", value: `${products.length || 0} items` },
    ],
  }[lossRange];

  const refreshBusinessLossData = async () => {
    if (!session || isAdminUser(session.user)) return;
    setLossLoading(true);
    setLossError("");
    try {
      const headers = { Authorization: `Bearer ${session.token}` };
      const [productsResponse, lossesResponse, reportResponse] = await Promise.all([
        fetch(`${API_URL}/api/products`, { headers }),
        fetch(`${API_URL}/api/losses`, { headers }),
        fetch(`${API_URL}/api/reports/summary`, { headers }),
      ]);
      if (!productsResponse.ok || !lossesResponse.ok || !reportResponse.ok) throw new Error("Unable to refresh inventory loss data.");
      const productsData = (await productsResponse.json()) as { products?: Product[] };
      const lossesData = (await lossesResponse.json()) as { losses?: LossEntry[] };
      const reportData = (await reportResponse.json()) as Partial<ReportSummary>;
      setProducts(Array.isArray(productsData.products) ? productsData.products : []);
      setLosses(Array.isArray(lossesData.losses) ? lossesData.losses : []);
      setReportSummary(normalizeReportSummary(reportData));
    } catch (error) {
      setLossError(error instanceof Error ? error.message : "Unable to refresh inventory loss data.");
    } finally {
      setLossLoading(false);
    }
  };

  const openLossForm = () => {
    setLossError("");
    setLossMessage("");
    setLossForm({ productId: products[0] ? String(products[0].id) : "", quantity: "1", reason: "Damaged", date: getTodayDateInput(), notes: "" });
    setLossModalOpen(true);
  };

  const handleCreateLoss = async () => {
    if (!session || isAdminUser(session.user)) return;
    if (!selectedLossProduct) {
      setLossError("Select a product to record its loss.");
      return;
    }
    if (!Number.isInteger(lossQuantity) || lossQuantity <= 0) {
      setLossError("Quantity lost must be a positive whole number.");
      return;
    }
    if (lossQuantity > selectedLossProduct.quantity) {
      setLossError("Insufficient stock. You cannot record a loss greater than the available stock.");
      return;
    }
    if (selectedLossProduct.costPrice === null) {
      setLossError("Set a cost price for this product before recording a loss.");
      return;
    }
    if (!lossForm.date || !lossForm.reason) {
      setLossError("Enter a date and loss reason.");
      return;
    }
    if (!window.confirm(`Record ${lossQuantity} lost unit(s) of ${selectedLossProduct.name} for ${formatCurrency(estimatedLoss)}?`)) return;

    setLossPending(true);
    setLossError("");
    try {
      const response = await fetch(`${API_URL}/api/losses`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedLossProduct.id,
          quantity: lossQuantity,
          reason: lossForm.reason,
          date: lossForm.date,
          notes: lossForm.notes,
        }),
      });
      const data = await parseApiResponse<{ loss?: LossEntry; message?: string }>(response, "Loss service");
      if (!response.ok || !data.loss) throw new Error(data.message || "Unable to record this inventory loss.");
      setLossModalOpen(false);
      setLossMessage(`Loss recorded for ${selectedLossProduct.name}.`);
      await refreshBusinessLossData();
    } catch (error) {
      setLossError(error instanceof Error ? error.message : "Unable to record this inventory loss.");
    } finally {
      setLossPending(false);
    }
  };

  const handleDeleteLoss = async (loss: LossEntry) => {
    if (!session || isAdminUser(session.user)) return;
    if (!window.confirm(`Delete this ${formatCurrency(loss.lossAmount)} loss record? Its quantity will be returned to stock.`)) return;
    setLossPending(true);
    setLossError("");
    setLossMessage("");
    try {
      const response = await fetch(`${API_URL}/api/losses/${loss.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const data = await parseApiResponse<{ productId?: string | null; restoredQuantity?: number | null; message?: string }>(response, "Loss service");
      if (!response.ok) throw new Error(data.message || "Unable to delete this inventory loss.");
      if (data.productId && data.restoredQuantity !== null && data.restoredQuantity !== undefined) {
        setProducts((current) => current.map((product) => String(product.id) === data.productId ? { ...product, quantity: data.restoredQuantity as number } : product));
      }
      setLossMessage("Loss record deleted and stock restored.");
      await refreshBusinessLossData();
    } catch (error) {
      setLossError(error instanceof Error ? error.message : "Unable to delete this inventory loss.");
    } finally {
      setLossPending(false);
    }
  };

  const handleRestock = async (productId: string | number) => {
    if (!session) return;

    try {
      const response = await fetch(`${API_URL}/api/products/${productId}/restock`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 1 }),
      });
      const data = await parseApiResponse<{ product?: Product; message?: string }>(response, "Product service");
      if (!response.ok || !data.product) throw new Error(data.message || "Unable to restock product.");
      setProducts((current) => current.map((product) => product.id === productId ? data.product as Product : product));
    } catch (error) {
      setSaleMessage(error instanceof Error ? error.message : "Unable to restock product.");
    }
  };

  const handleAddToCart = (product: Product) => {
    setCart((current) => {
      const existing = current.find((item) => item.name === product.name);
      if (existing) {
        return current.map((item) =>
          item.name === product.name ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }

      return [...current, { id: product.id, name: product.name, quantity: 1, price: product.price, costPrice: product.costPrice }];
    });
  };

  const handleRemoveFromCart = (itemId: string | number) => {
    setCart((current) => current.filter((item) => item.id !== itemId));
  };

  const handleCompleteSale = async () => {
    if (!cart.length) {
      setSaleMessage("Add at least one product before completing a sale.");
      return;
    }

    if (!session) return;

    try {
      const response = await fetch(`${API_URL}/api/sales`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ items: cart.map((item) => ({ productId: item.id, quantity: item.quantity })) }),
      });
      const data = (await response.json()) as { sale?: { id: string; reference: string; customer: string; payment_method: string; total: number; totalCost: number; totalProfit: number; created_at: string }; message?: string };
      if (!response.ok || !data.sale) throw new Error(data.message || "Unable to complete sale.");
      const createdAt = new Date(data.sale.created_at);
      setHistory((current) => [{
        id: Number(data.sale?.id) || Date.now(),
        date: createdAt.toISOString().slice(0, 10),
        time: createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        reference: data.sale?.reference || "",
        customer: data.sale?.customer || "Walk-in Customer",
        payment: data.sale?.payment_method || "Cash",
        total: Number(data.sale?.total || 0),
        totalCost: Number(data.sale?.totalCost || 0),
        totalProfit: Number(data.sale?.totalProfit || 0),
      }, ...current]);
      setProducts((current) => current.map((product) => {
        const item = cart.find((cartItem) => cartItem.id === product.id);
        return item ? { ...product, quantity: product.quantity - item.quantity } : product;
      }));
      setCart([]);
      setSaleMessage(`Sale ${data.sale.reference} completed successfully.`);
    } catch (error) {
      setSaleMessage(error instanceof Error ? error.message : "Unable to complete sale.");
    }
  };

  const handleCreateProduct = async () => {
    if (!session || isAdminUser(session.user)) {
      setProductMessage("Only a registered business account can add products.");
      setProductMessageType("error");
      return;
    }

    if (!newProduct.name.trim()) {
      setProductMessage("Please enter a product name.");
      setProductMessageType("error");
      return;
    }

    const quantity = Number(newProduct.quantity);
    const price = Number(newProduct.price.replace(",", "."));
    const costPrice = newProduct.costPrice.trim() ? Number(newProduct.costPrice.replace(",", ".")) : null;
    if (!Number.isInteger(quantity) || quantity < 0 || !Number.isFinite(price) || price < 0 || (costPrice !== null && (!Number.isFinite(costPrice) || costPrice < 0))) {
      setProductMessage("Enter valid quantity, cost price, and selling price values.");
      setProductMessageType("error");
      return;
    }

    setProductPending(true);
    setProductMessage("");
    try {
      const response = await fetch(`${API_URL}/api/products${editingProductId ? `/${editingProductId}` : ""}`, {
        method: editingProductId ? "PUT" : "POST",
        headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newProduct.name,
          category: newProduct.category,
          quantity,
          price,
          sellingPrice: price,
          costPrice,
          lowStockThreshold: 5,
        }),
      });
      const responseText = await response.text();
      let data: { product?: Product; message?: string };
      try {
        data = JSON.parse(responseText) as { product?: Product; message?: string };
      } catch {
        throw new Error(`Product service returned an invalid response (${response.status}). Check the API deployment and database connection.`);
      }
      if (!response.ok || !data.product) throw new Error(data.message || "Unable to create product.");
      if (editingProductId) {
        setProducts((current) => current.map((product) => product.id === editingProductId ? data.product as Product : product));
      } else {
        setProducts((current) => [data.product as Product, ...current]);
      }
      setNewProduct({ name: "", category: "Bakery", quantity: "1", price: "18.5", costPrice: "" });
      setEditingProductId(null);
      setProductMessage(`Product ${data.product.name} ${editingProductId ? "updated" : "added"} successfully.`);
      setProductMessageType("success");
    } catch (error) {
      setProductMessage(error instanceof Error ? error.message : "Unable to create product.");
      setProductMessageType("error");
    } finally {
      setProductPending(false);
    }
  };

  const handleExportCsv = async () => {
    if (!session) return;

    try {
      const response = await fetch(`${API_URL}/api/reports/sales.csv`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (!response.ok) throw new Error("Unable to export sales history.");
      const csv = await response.text();
      const downloadUrl = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = "spazakeep-sales.csv";
      link.click();
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      setSaleMessage(error instanceof Error ? error.message : "Unable to export sales history.");
    }
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
    setAuthNotice("");

    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const responseText = await response.text();
      let data: { token?: string; user?: AuthUser; message?: string } = {};
      try {
        data = JSON.parse(responseText) as { token?: string; user?: AuthUser; message?: string };
      } catch {
        throw new Error(`Authentication service returned an invalid response (${response.status}).`);
      }

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

  const submitRecoveryRequest = async (endpoint: string, payload: Record<string, string>) => {
    setRecoveryPending(true);
    setRecoveryMessage("");
    setRecoveryError("");
    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const responseText = await response.text();
      let data: { message?: string; maskedEmail?: string } = {};
      try {
        data = JSON.parse(responseText) as { message?: string; maskedEmail?: string };
      } catch {
        throw new Error(`Recovery service returned an invalid response (${response.status}). Restart the API and try again.`);
      }
      if (!response.ok) throw new Error(data.message || "Recovery request could not be completed.");
      setRecoveryMessage(data.maskedEmail ? `Matching account email: ${data.maskedEmail}` : data.message || "Request received.");
    } catch (error) {
      setRecoveryError(error instanceof Error ? error.message : "Recovery request could not be completed.");
    } finally {
      setRecoveryPending(false);
    }
  };

  const handleForgotPassword = async () => {
    await submitRecoveryRequest("/api/auth/forgot-password", { email: recoveryEmail });
  };

  const handleForgotEmail = async () => {
    await submitRecoveryRequest("/api/auth/forgot-email", recoveryDetails);
  };

  const handleResetPassword = async () => {
    if (resetPasswords.password.length < 8) {
      setRecoveryError("Use a password with at least 8 characters.");
      return;
    }
    if (resetPasswords.password !== resetPasswords.confirmPassword) {
      setRecoveryError("The password confirmation does not match.");
      return;
    }

    setRecoveryPending(true);
    setRecoveryError("");
    setRecoveryMessage("");
    try {
      const response = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetToken, ...resetPasswords }),
      });
      const responseText = await response.text();
      let data: { message?: string } = {};
      try {
        data = JSON.parse(responseText) as { message?: string };
      } catch {
        throw new Error(`Recovery service returned an invalid response (${response.status}). Restart the API and try again.`);
      }
      if (!response.ok) throw new Error(data.message || "The reset link is invalid or expired.");
      setRecoveryMessage(data.message || "Password reset. Sign in with your new password.");
      setAuthNotice(data.message || "Your password has been reset. Sign in with your new password.");
      setResetToken("");
      setResetPasswords({ password: "", confirmPassword: "" });
      setAuthMode("login");
      window.history.replaceState({}, "", window.location.pathname);
    } catch (error) {
      setRecoveryError(error instanceof Error ? error.message : "Unable to reset password.");
    } finally {
      setRecoveryPending(false);
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

  const handleUpdateUser = async (userId: string) => {
    if (!session || !isAdminUser(session.user)) return;

    try {
      const response = await fetch(`${API_URL}/api/admin/users/${userId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${session.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(editingUserForm),
      });
      const data = (await response.json()) as { user?: ManagedUser; message?: string };
      if (!response.ok || !data.user) throw new Error(data.message || "Unable to update user.");

      setAdminUsers((current) => current.map((user) => user.id === userId ? data.user as ManagedUser : user));
      setAdminRecentUsers((current) => current.map((user) => user.id === userId ? data.user as ManagedUser : user));
      setEditingUserId(null);
      setAuthError("");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to update user.");
    }
  };

  const renderDashboard = () => (
    <>
      <div className="mb-5 flex flex-col items-start justify-between gap-4 sm:flex-row">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
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
          className="shrink-0 rounded-lg bg-[#111827] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white"
        >
          {session?.user && isAdminUser(session.user) ? "Manage Users" : "New Quote Sale"}
        </button>
      </div>

      {session?.user && isAdminUser(session.user) ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {dashboardStats.map((stat) => (
            <div key={stat.label} className="rounded-xl border border-[#e5e5e2] bg-white p-4 shadow-sm">
              <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">{stat.label}</p>
              <p className="mt-3 text-3xl font-bold tracking-tight">{stat.value}</p>
              <p className="mt-2 text-xs text-zinc-500">{stat.note}</p>
            </div>
          ))}
        </div>
      )}

      {session?.user && !isAdminUser(session.user) ? (
        <div className="mt-5 space-y-5">
          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-600">Inventory loss overview</h2>
                <p className="mt-1 text-xs text-zinc-500">Loss performance for the business across recent periods</p>
              </div>
              <div className="inline-flex rounded-full border border-zinc-200 bg-zinc-50 p-1">
                {(["all", "week", "month"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setLossRange(option)}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition ${
                      lossRange === option ? "bg-[#111827] text-white shadow-sm" : "text-zinc-600 hover:text-zinc-900"
                    }`}
                  >
                    {option === "all" ? "All" : option === "week" ? "Week" : "Month"}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {lossMetrics.map((stat) => (
                <div key={stat.label} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{stat.label}</p>
                  <p className="mt-2 text-xl font-bold tracking-tight text-zinc-900">{stat.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between gap-2 border-t border-zinc-200 pt-4 text-sm text-zinc-600">
              <span>Loss transactions</span>
              <span className="font-semibold text-zinc-900">{reportSummary.lossSummary.transactions}</span>
            </div>
          </section>

          <div className="grid min-w-0 gap-5 xl:grid-cols-[1.2fr_0.8fr]">
            <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-600">Inventory loss trend</h2>
                  <p className="mt-1 text-xs text-zinc-500">Loss value over the last 14 days</p>
                </div>
                <button type="button" onClick={() => setActiveScreen("losses")} className="text-xs font-semibold text-zinc-600 underline decoration-zinc-300">Loss history</button>
              </div>
              {lossBars.length ? (
                <div className="flex h-48 items-end gap-2 overflow-x-auto border-b border-zinc-200 pb-2">
                  {lossBars.map((day) => (
                    <div key={day.date} title={`${day.date}: ${formatCurrency(day.amount)}`} className="flex h-full min-w-8 flex-1 flex-col items-center justify-end">
                      <div className="w-full rounded-t-lg bg-gradient-to-t from-rose-300 to-rose-200" style={{ height: `${day.height}%` }} />
                      <span className="mt-2 whitespace-nowrap text-[10px] text-zinc-500">{new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="py-12 text-center text-sm text-zinc-500">No losses recorded in the last 14 days.</p>}
            </section>

            <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-600">Products with highest losses</h2>
              <div className="mt-3 space-y-3">
                {reportSummary.lossSummary.topProducts.map((product) => (
                  <div key={product.name} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                    <div>
                      <p className="text-sm font-medium text-zinc-800">{product.name}</p>
                      <p className="text-xs text-zinc-500">{product.quantity} units written off</p>
                    </div>
                    <span className="whitespace-nowrap text-sm font-semibold text-rose-700">{formatCurrency(product.amount)}</span>
                  </div>
                ))}
                {!reportSummary.lossSummary.topProducts.length ? <p className="py-5 text-sm text-zinc-500">No losses recorded yet.</p> : null}
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {session?.user && isAdminUser(session.user) ? (
        <div className="mt-5 grid min-w-0 gap-5 xl:grid-cols-[1.1fr_0.9fr]">
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
        <div className="mt-5 grid min-w-0 gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-xl border border-[#e5e5e2] bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-600">Urgent stock alerts</h2>
              <button onClick={() => setActiveScreen("products")} className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                View all
              </button>
            </div>

            <div className="space-y-3">
              {quickActions.map((action, index) => (
                <div key={action} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold ${index % 2 === 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                      {index + 1}
                    </span>
                    <div>
                      <p className="break-words text-sm font-medium text-zinc-800">{action}</p>
                      <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">{index === 0 ? "Requires action" : "Ready"}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveScreen(index === 0 ? "products" : index === 1 ? "pos" : index === 2 ? "products" : "history")}
                    className="shrink-0 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-100"
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
          <p className="text-sm text-zinc-500">
            {session?.user?.businessName || session?.user?.name || "Your business"}: manage your products, stock, and low-stock items.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={openLossForm} className="rounded-lg bg-[#111827] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white">
            Record Loss
          </button>
          <button type="button" onClick={() => setActiveScreen("losses")} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-700">
            Loss History
          </button>
          <button
            onClick={() => setActiveScreen("pos")}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-700"
          >
            + Add New Product
          </button>
        </div>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleCreateProduct();
        }}
        className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-[#e5e5e2] bg-white p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-3"
      >
        <input
          type="number"
          min="0"
          step="0.01"
          value={newProduct.costPrice}
          onChange={(event) => setNewProduct((current) => ({ ...current, costPrice: event.target.value }))}
          placeholder="Cost price"
          className="w-full min-w-0 rounded-lg border border-[#e6e6e3] bg-white px-3 py-2 text-sm text-zinc-700 outline-none"
        />
        <input
          value={newProduct.name}
          onChange={(event) => setNewProduct((current) => ({ ...current, name: event.target.value }))}
          placeholder="Product name"
          className="w-full min-w-0 rounded-lg border border-[#e6e6e3] bg-white px-3 py-2 text-sm text-zinc-700 outline-none"
        />
        <select
          value={newProduct.category}
          onChange={(event) => setNewProduct((current) => ({ ...current, category: event.target.value }))}
          className="w-full min-w-0 rounded-lg border border-[#e6e6e3] bg-white px-3 py-2 text-sm text-zinc-700 outline-none"
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
          className="w-full min-w-0 rounded-lg border border-[#e6e6e3] bg-white px-3 py-2 text-sm text-zinc-700 outline-none"
        />
        <input
          type="number"
          step="0.01"
          min="0"
          value={newProduct.price}
          onChange={(event) => setNewProduct((current) => ({ ...current, price: event.target.value }))}
          placeholder="Selling price"
          className="w-full min-w-0 rounded-lg border border-[#e6e6e3] bg-white px-3 py-2 text-sm text-zinc-700 outline-none"
        />
        <button type="submit" disabled={productPending} className="w-full rounded-lg bg-[#111827] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white disabled:opacity-60">
          {productPending ? "Saving..." : editingProductId ? "Save" : "Add"}
        </button>
      </form>

      {productMessage ? <p role={productMessageType === "error" ? "alert" : "status"} className={`mb-4 text-sm font-medium ${productMessageType === "error" ? "text-red-700" : "text-emerald-700"}`}>{productMessage}</p> : null}

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
                    <button
                      onClick={() => {
                        setEditingProductId(product.id);
                        setNewProduct({ name: product.name, category: product.category, quantity: String(product.quantity), price: String(product.price), costPrice: product.costPrice === null ? "" : String(product.costPrice) });
                      }}
                      className="ml-2 rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-700"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {lossMessage ? <p role="status" className="mt-3 text-sm font-medium text-emerald-700">{lossMessage}</p> : null}

      {lossModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="record-loss-title" className="my-auto w-full max-w-xl rounded-xl border border-zinc-200 bg-white p-5 shadow-xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 id="record-loss-title" className="text-xl font-semibold text-zinc-900">Record Loss</h2>
                <p className="mt-1 text-sm text-zinc-500">Stock will be reduced and the cost-based loss saved together.</p>
              </div>
              <button type="button" onClick={() => setLossModalOpen(false)} disabled={lossPending} aria-label="Close record loss" className="text-sm text-zinc-500 underline disabled:opacity-50">Close</button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-zinc-700 sm:col-span-2">
                Product
                <select value={lossForm.productId} onChange={(event) => setLossForm((current) => ({ ...current, productId: event.target.value }))} className="rounded-md border border-zinc-300 bg-white px-3 py-2.5" required>
                  <option value="">Select product</option>
                  {products.map((product) => <option key={product.id} value={String(product.id)}>{product.name} ({product.quantity} available)</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium text-zinc-700">
                Quantity lost
                <input type="number" min="1" step="1" max={selectedLossProduct?.quantity ?? undefined} value={lossForm.quantity} onChange={(event) => setLossForm((current) => ({ ...current, quantity: event.target.value }))} className="rounded-md border border-zinc-300 px-3 py-2.5" required />
              </label>
              <label className="grid gap-1 text-sm font-medium text-zinc-700">
                Reason
                <select value={lossForm.reason} onChange={(event) => setLossForm((current) => ({ ...current, reason: event.target.value as LossReason }))} className="rounded-md border border-zinc-300 bg-white px-3 py-2.5" required>
                  {LOSS_REASONS.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium text-zinc-700">
                Date
                <input type="date" value={lossForm.date} onChange={(event) => setLossForm((current) => ({ ...current, date: event.target.value }))} className="rounded-md border border-zinc-300 px-3 py-2.5" required />
              </label>
              <div className="grid content-center gap-1 rounded-md bg-zinc-50 px-3 py-2.5 text-sm">
                <p className="text-zinc-600">Cost price: <span className="font-semibold text-zinc-900">{selectedLossProduct?.costPrice === null || !selectedLossProduct ? "Not set" : formatCurrency(selectedLossProduct.costPrice)}</span></p>
                <p className="text-zinc-600">Available stock: <span className="font-semibold text-zinc-900">{selectedLossProduct?.quantity ?? "Select a product"}</span></p>
                <p className="text-zinc-800">Estimated loss: <span className="font-semibold">{formatCurrency(estimatedLoss)}</span></p>
              </div>
              <label className="grid gap-1 text-sm font-medium text-zinc-700 sm:col-span-2">
                Notes (optional)
                <textarea value={lossForm.notes} maxLength={1000} rows={3} onChange={(event) => setLossForm((current) => ({ ...current, notes: event.target.value }))} className="resize-y rounded-md border border-zinc-300 px-3 py-2.5" />
              </label>
            </div>

            {!products.length ? <p className="mt-3 text-sm text-zinc-500">Add a product before recording a loss.</p> : null}
            {lossError ? <p role="alert" className="mt-3 text-sm text-red-700">{lossError}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setLossModalOpen(false)} disabled={lossPending} className="rounded-md border border-zinc-300 px-4 py-2 text-sm text-zinc-700 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={() => void handleCreateLoss()} disabled={lossPending || !products.length} className="rounded-md bg-[#111827] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{lossPending ? "Recording..." : "Confirm loss"}</button>
            </div>
          </section>
        </div>
      ) : null}
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
        <button onClick={handleExportCsv} className="rounded-lg bg-[#111827] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white">
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
                <th className="px-4 py-3 font-semibold text-right">Gross Profit</th>
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
                  <td className="px-4 py-3 text-right font-semibold text-emerald-700">{formatCurrency(row.totalProfit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );

  const renderLossHistory = () => (
    <>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Loss History</h1>
          <p className="text-sm text-zinc-500">Recorded inventory losses for {currentBusinessName}.</p>
        </div>
        <button type="button" onClick={() => setActiveScreen("products")} className="rounded-lg bg-[#111827] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white">Inventory</button>
      </div>

      {lossMessage ? <p role="status" className="mb-3 text-sm font-medium text-emerald-700">{lossMessage}</p> : null}
      {lossError ? <p role="alert" className="mb-3 text-sm font-medium text-red-700">{lossError}</p> : null}

      <div className="overflow-hidden rounded-xl border border-[#e5e5e2] bg-white">
        <div className="grid gap-3 border-b border-zinc-200 bg-zinc-50 p-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="grid gap-1 text-xs font-semibold uppercase text-zinc-500">From<input type="date" value={lossFilters.from} onChange={(event) => setLossFilters((current) => ({ ...current, from: event.target.value }))} className="rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm font-normal text-zinc-800" /></label>
          <label className="grid gap-1 text-xs font-semibold uppercase text-zinc-500">To<input type="date" value={lossFilters.to} onChange={(event) => setLossFilters((current) => ({ ...current, to: event.target.value }))} className="rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm font-normal text-zinc-800" /></label>
          <label className="grid gap-1 text-xs font-semibold uppercase text-zinc-500">Product<select value={lossFilters.productId} onChange={(event) => setLossFilters((current) => ({ ...current, productId: event.target.value }))} className="rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm font-normal text-zinc-800"><option value="all">All products</option>{products.map((product) => <option key={product.id} value={String(product.id)}>{product.name}</option>)}</select></label>
          <label className="grid gap-1 text-xs font-semibold uppercase text-zinc-500">Reason<select value={lossFilters.reason} onChange={(event) => setLossFilters((current) => ({ ...current, reason: event.target.value }))} className="rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm font-normal text-zinc-800"><option value="all">All reasons</option>{LOSS_REASONS.map((reason) => <option key={reason} value={reason}>{reason}</option>)}</select></label>
        </div>

        {lossLoading ? <p className="p-6 text-sm text-zinc-500">Loading loss history...</p> : filteredLosses.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead><tr className="bg-zinc-100 text-[11px] uppercase text-zinc-500"><th className="px-3 py-3">Date</th><th className="px-3 py-3">Product</th><th className="px-3 py-3 text-right">Quantity</th><th className="px-3 py-3 text-right">Cost Price</th><th className="px-3 py-3 text-right">Loss Amount</th><th className="px-3 py-3">Reason</th><th className="px-3 py-3">Notes</th><th className="px-3 py-3 text-right">Action</th></tr></thead>
              <tbody>{filteredLosses.map((loss) => (
                <tr key={loss.id} className="border-t border-zinc-100">
                  <td className="whitespace-nowrap px-3 py-3 text-zinc-600">{loss.date}</td>
                  <td className="px-3 py-3 font-medium text-zinc-800">{loss.productName}</td>
                  <td className="px-3 py-3 text-right text-zinc-700">{loss.quantity}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right text-zinc-700">{formatCurrency(loss.costPrice)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-semibold text-red-700">{formatCurrency(loss.lossAmount)}</td>
                  <td className="px-3 py-3 text-zinc-700">{loss.reason}</td>
                  <td className="max-w-56 px-3 py-3 text-zinc-600">{loss.notes || "-"}</td>
                  <td className="px-3 py-3 text-right"><button type="button" onClick={() => void handleDeleteLoss(loss)} disabled={lossPending} className="rounded border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 disabled:opacity-50">{lossPending ? "Working..." : "Delete"}</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="p-6 text-sm text-zinc-500">{losses.length ? "No losses match these filters." : "No inventory losses have been recorded."}</p>}
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
                  <th className="px-4 py-3 font-semibold">Tagline</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length ? (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="border-t border-[#f0f0ee]">
                      <td className="px-4 py-3 text-zinc-700">
                        {editingUserId === user.id ? (
                          <input value={editingUserForm.name} onChange={(event) => setEditingUserForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded border border-zinc-300 px-2 py-1" aria-label="User name" />
                        ) : user.name}
                      </td>
                      <td className="px-4 py-3 text-zinc-700">
                        {editingUserId === user.id ? (
                          <input value={editingUserForm.businessName} onChange={(event) => setEditingUserForm((current) => ({ ...current, businessName: event.target.value }))} className="w-full rounded border border-zinc-300 px-2 py-1" aria-label="Business name" />
                        ) : user.businessName || "Unknown"}
                      </td>
                      <td className="px-4 py-3 text-zinc-700">{user.email}</td>
                      <td className="px-4 py-3 text-zinc-700">
                        {editingUserId === user.id ? (
                          <input value={editingUserForm.businessTagline} onChange={(event) => setEditingUserForm((current) => ({ ...current, businessTagline: event.target.value }))} className="w-full rounded border border-zinc-300 px-2 py-1" aria-label="Business tagline" />
                        ) : user.businessTagline || ""}
                      </td>
                      <td className="px-4 py-3 text-zinc-700">{user.role === "admin" ? "Admin" : "Business User"}</td>
                      <td className="px-4 py-3 text-right">
                        {editingUserId === user.id ? (
                          <>
                            <button type="button" onClick={() => void handleUpdateUser(user.id)} className="rounded-md bg-[#111827] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">Save</button>
                            <button type="button" onClick={() => setEditingUserId(null)} className="ml-2 rounded-md border border-zinc-200 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-700">Cancel</button>
                          </>
                        ) : (
                          <button
                            type="button"
                            disabled={user.role === "admin"}
                            onClick={() => {
                              setEditingUserId(user.id);
                              setEditingUserForm({ name: user.name, businessName: user.businessName, businessTagline: user.businessTagline });
                            }}
                            className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {user.role === "admin" ? "Protected" : "Edit"}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(user.id)}
                          disabled={user.role === "admin"}
                          className="ml-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {user.role === "admin" ? "Protected" : "Delete"}
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-zinc-500">
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
              <p className="mt-2 text-3xl font-bold">{formatCurrency(reportSummary.revenue)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Items Sold</p>
              <p className="mt-2 text-3xl font-bold">{reportSummary.transactions} Sales</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Net Profit</p>
              <p className="mt-2 text-3xl font-bold text-emerald-600">{formatCurrency(reportSummary.profit)}</p>
            </div>
          </div>
          <div className="mt-4 grid gap-4 border-t border-[#efefec] pt-4 md:grid-cols-2">
            <p className="text-sm text-zinc-600">Cost of goods sold: <span className="font-semibold text-zinc-900">{formatCurrency(reportSummary.cost)}</span></p>
            <p className="text-sm text-zinc-600">Gross profit: <span className="font-semibold text-zinc-900">{formatCurrency(reportSummary.grossProfit)}</span></p>
            <p className="text-sm text-zinc-600">Inventory losses: <span className="font-semibold text-red-700">-{formatCurrency(reportSummary.inventoryLosses)}</span></p>
            <p className="text-sm text-zinc-600">Gross profit is captured at sale time; net profit deducts each inventory loss once.</p>
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
            {reportSummary.topProducts.slice(0, 3).map((product, index) => (
                <div key={`${product.name}-${index}`} className="flex items-center justify-between rounded-lg bg-[#f7f7f5] p-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-800">{product.name}</p>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">{product.quantity} units sold</p>
                  </div>
                  <span className="text-sm font-bold text-emerald-700">{formatCurrency(product.profit)} profit</span>
                </div>
              ))}
            {!reportSummary.topProducts.length ? <p className="text-sm text-zinc-500">No sales data yet.</p> : null}
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
    losses: renderLossHistory(),
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
              {authMode === "login" || authMode === "signup" ? <div className="mb-6">
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
              </div> : null}

              <div className="space-y-4">
                {authMode === "forgot-password" ? (
                  <>
                    <h2 className="text-xl font-semibold text-zinc-900">Forgot password</h2>
                    <p className="text-sm text-zinc-600">Enter your registered email. If an account exists for this email, a password reset link will be sent.</p>
                    <label htmlFor="recovery-email" className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Email address</label>
                    <input id="recovery-email" type="email" autoComplete="email" value={recoveryEmail} onChange={(event) => setRecoveryEmail(event.target.value)} className="w-full rounded-lg border border-[#e5e5e2] bg-[#f7f7f5] px-3 py-3 text-sm text-zinc-800 outline-none focus:border-[#111827]" />
                    {recoveryMessage ? <p role="status" className="text-sm text-emerald-700">{recoveryMessage}</p> : null}
                    {recoveryError ? <p role="alert" className="text-sm text-red-600">{recoveryError}</p> : null}
                    <button type="button" onClick={handleForgotPassword} disabled={recoveryPending} className="w-full rounded-lg bg-[#111827] px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-white disabled:opacity-60">{recoveryPending ? "Please wait..." : "Send reset link"}</button>
                    <button type="button" onClick={() => { setAuthMode("login"); setRecoveryError(""); setRecoveryMessage(""); }} className="w-full text-sm text-zinc-600 underline">Back to sign in</button>
                  </>
                ) : authMode === "forgot-email" ? (
                  <>
                    <h2 className="text-xl font-semibold text-zinc-900">Forgot email</h2>
                    <p className="text-sm text-zinc-600">Enter the account holder and business names. A matching account returns a masked email address.</p>
                    <label htmlFor="recovery-name" className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Account holder name</label>
                    <input id="recovery-name" autoComplete="name" value={recoveryDetails.name} onChange={(event) => setRecoveryDetails((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-lg border border-[#e5e5e2] bg-[#f7f7f5] px-3 py-3 text-sm text-zinc-800 outline-none focus:border-[#111827]" />
                    <label htmlFor="recovery-business" className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Business name</label>
                    <input id="recovery-business" value={recoveryDetails.businessName} onChange={(event) => setRecoveryDetails((current) => ({ ...current, businessName: event.target.value }))} className="w-full rounded-lg border border-[#e5e5e2] bg-[#f7f7f5] px-3 py-3 text-sm text-zinc-800 outline-none focus:border-[#111827]" />
                    {recoveryMessage ? <p role="status" className="text-sm text-emerald-700">{recoveryMessage}</p> : null}
                    {recoveryError ? <p role="alert" className="text-sm text-red-600">{recoveryError}</p> : null}
                    <button type="button" onClick={handleForgotEmail} disabled={recoveryPending} className="w-full rounded-lg bg-[#111827] px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-white disabled:opacity-60">{recoveryPending ? "Please wait..." : "Find my email"}</button>
                    <button type="button" onClick={() => { setAuthMode("login"); setRecoveryError(""); setRecoveryMessage(""); }} className="w-full text-sm text-zinc-600 underline">Back to sign in</button>
                  </>
                ) : authMode === "reset-password" ? (
                  <>
                    <h2 className="text-xl font-semibold text-zinc-900">Set a new password</h2>
                    <p className="text-sm text-zinc-600">Choose a new password with at least 8 characters.</p>
                    <label htmlFor="new-password" className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">New password</label>
                    <input id="new-password" type="password" autoComplete="new-password" value={resetPasswords.password} onChange={(event) => setResetPasswords((current) => ({ ...current, password: event.target.value }))} className="w-full rounded-lg border border-[#e5e5e2] bg-[#f7f7f5] px-3 py-3 text-sm text-zinc-800 outline-none focus:border-[#111827]" />
                    <label htmlFor="confirm-password" className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Confirm new password</label>
                    <input id="confirm-password" type="password" autoComplete="new-password" value={resetPasswords.confirmPassword} onChange={(event) => setResetPasswords((current) => ({ ...current, confirmPassword: event.target.value }))} className="w-full rounded-lg border border-[#e5e5e2] bg-[#f7f7f5] px-3 py-3 text-sm text-zinc-800 outline-none focus:border-[#111827]" />
                    {recoveryMessage ? <p role="status" className="text-sm text-emerald-700">{recoveryMessage}</p> : null}
                    {recoveryError ? <p role="alert" className="text-sm text-red-600">{recoveryError}</p> : null}
                    <button type="button" onClick={handleResetPassword} disabled={recoveryPending || !resetToken} className="w-full rounded-lg bg-[#111827] px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-white disabled:opacity-60">{recoveryPending ? "Please wait..." : "Reset password"}</button>
                  </>
                ) : (
                  <>
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
                    placeholder="you@business.com"
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

                {authMode === "login" ? (
                  <div className="flex justify-between text-sm">
                    <button type="button" onClick={() => { setAuthMode("forgot-password"); setRecoveryEmail(loginForm.email); setRecoveryMessage(""); setRecoveryError(""); }} className="text-zinc-600 underline">Forgot Password?</button>
                    <button type="button" onClick={() => { setAuthMode("forgot-email"); setRecoveryMessage(""); setRecoveryError(""); }} className="text-zinc-600 underline">Forgot Email?</button>
                  </div>
                ) : null}

                {authMode === "login" && authNotice ? <p role="status" className="text-sm text-emerald-700">{authNotice}</p> : null}
                {authError ? <p className="text-sm text-red-600">{authError}</p> : null}

                <button
                  type="button"
                  onClick={handleAuthSubmit}
                  disabled={isProcessingAuth}
                  className="w-full rounded-lg bg-[#111827] px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-white disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isProcessingAuth ? "Please wait..." : authMode === "login" ? "Login to dashboard" : "Create account"}
                </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const navigationItems: Array<{ key: ScreenKey; label: string }> = session?.user && isAdminUser(session.user)
    ? [
        { key: "dashboard", label: "Dashboard Overview" },
        { key: "users", label: "Manage Users" },
      ]
    : navItems.map((item) => ({ key: item.key as ScreenKey, label: item.label }));

  return (
    <div className="min-h-dvh w-full bg-[#f5f5f3] text-[#111827]">
      <div className="w-full min-w-0">
        <section className="min-h-dvh w-full overflow-hidden bg-[#f3f3f1]">
          <div className="grid min-h-dvh min-w-0 grid-cols-1 bg-[#f5f5f3] md:grid-cols-[220px_minmax(0,1fr)]">
            <aside className="flex min-w-0 flex-col border-b border-[#deded8] bg-[#f0f0ee] p-3 sm:p-4 md:border-b-0 md:border-r">
              <div className="mb-4 flex min-w-0 items-center gap-3 md:mb-6">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0d0d0d] text-xs font-bold text-white">{currentBusinessName.charAt(0).toUpperCase() || "S"}</div>
                <div>
                  <p className="break-words text-lg font-bold leading-tight">{currentBusinessName}</p>
                  <p className="text-[10px] leading-4 text-zinc-500 md:uppercase md:tracking-[0.2em]">Small Business Inventory Sales Tracker</p>
                </div>
              </div>

              <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
                {navigationItems.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setActiveScreen(item.key)}
                    className={`flex w-auto shrink-0 items-center whitespace-nowrap rounded-lg px-3 py-2.5 text-left text-sm font-medium transition md:w-full ${
                      activeScreen === item.key ? "bg-[#111827] text-white shadow-sm" : "text-zinc-700 hover:bg-white hover:text-zinc-900"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </nav>

              <button
                onClick={handleLogout}
                className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-700 transition hover:bg-zinc-100 md:mt-auto"
              >
                Logout
              </button>
            </aside>

            <main className="min-w-0 p-3 sm:p-5">{viewMap[activeScreen]}</main>
          </div>
        </section>
      </div>
    </div>
  );
}
