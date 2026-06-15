export const API_BASE = import.meta.env.VITE_API_URL || '/api';

export interface ScheduleEvent {
  id: number;
  title: string;
  description: string | null;
  date: string;
  startTime: string;
  endTime: string;
}

export interface PlanItem {
  id: number;
  title: string;
  description: string | null;
  date: string;
  completed: boolean;
  completedAt: string | null;
  originalDate: string;
  isCarriedOver: boolean;
}

export interface DietEntryItem {
  id: number;
  name: string;
  mealType: string;
  date: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  portionGrams: number | null;
  photoFileId: string | null;
  photoData?: string;
}

export interface DietSummary {
  date: string;
  eaten: { calories: number; protein: number; fat: number; carbs: number };
  goals: { dailyCalories: number; dailyProtein: number; dailyFat: number; dailyCarbs: number } | null;
  remaining: { calories: number; protein: number; fat: number; carbs: number } | null;
  entries: number;
}

export interface NutritionProfile {
  id: number;
  userId: number;
  height: number;
  weight: number;
  age: number;
  gender: string;
  activityLevel: string;
  goal: string;
  dailyCalories: number;
  dailyProtein: number;
  dailyFat: number;
  dailyCarbs: number;
}

export interface UserProfile {
  id: number;
  telegramId: string;
  firstName: string | null;
  lastName: string | null;
  timezone: string;
  nutritionProfile: NutritionProfile | null;
  isGoogleCalendarConnected: boolean;
}

// ─── Finance Types ───
export interface FinanceAccount {
  id: number;
  userId: number;
  name: string;
  balance: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseCategory {
  id: number;
  userId: number;
  name: string;
  icon: string;
  color: string;
  spentThisMonth: number;
  createdAt: string;
  updatedAt: string;
}

export interface FinanceTransaction {
  id: number;
  userId: number;
  type: 'income' | 'expense';
  amount: number;
  comment: string | null;
  date: string;
  accountId: number | null;
  categoryId: number | null;
  createdAt: string;
  updatedAt: string;
  account?: FinanceAccount | null;
  category?: ExpenseCategory | null;
}

export interface FinanceStats {
  income: number;
  expense: number;
}

export interface CategoryStats {
  category: ExpenseCategory;
  transactions: FinanceTransaction[];
  history: { month: string; label: string; amount: number }[];
}

export async function api<T = unknown>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  
  const tg = (window as unknown as {
    Telegram?: {
      WebApp?: {
        initData?: string;
      };
    };
  }).Telegram?.WebApp;

  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  if (tg?.initData) {
    headers.set('Authorization', `tma ${tg.initData}`);
  }
  if (options?.headers) {
    const extraHeaders = new Headers(options.headers);
    extraHeaders.forEach((value, key) => {
      headers.set(key, value);
    });
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let errMsg = `API Error: ${res.status} ${res.statusText}`;
    try {
      const errData = await res.json() as { error?: string };
      if (errData && errData.error) {
        errMsg = `${errMsg} - ${errData.error}`;
      }
    } catch {
      // Игнорируем ошибку парсинга, если ответ не JSON
    }
    throw new Error(errMsg);
  }

  return res.json() as Promise<T>;
}

// ─── Schedule API ───
export const scheduleApi = {
  getByDate: (date?: string) =>
    api<ScheduleEvent[]>(`/schedule${date ? `?date=${date}` : ''}`),

  create: (data: {
    title: string;
    description?: string;
    date: string;
    startTime: string;
    endTime: string;
  }) => api<ScheduleEvent>('/schedule', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: number, data: Partial<ScheduleEvent>) =>
    api<ScheduleEvent>(`/schedule/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (id: number) =>
    api<{ success: boolean }>(`/schedule/${id}`, { method: 'DELETE' }),
};

// ─── Plans API ───
export const plansApi = {
  getByDate: (date?: string) =>
    api<PlanItem[]>(`/plans${date ? `?date=${date}` : ''}`),

  create: (data: {
    title: string;
    description?: string;
    date: string;
  }) => api<PlanItem>('/plans', { method: 'POST', body: JSON.stringify(data) }),

  complete: (id: number, date?: string) =>
    api<PlanItem>(`/plans/${id}/complete`, {
      method: 'PUT',
      body: JSON.stringify({ date }),
    }),

  uncomplete: (id: number) =>
    api<PlanItem>(`/plans/${id}/uncomplete`, { method: 'PUT' }),

  update: (id: number, data: Partial<PlanItem>) =>
    api<PlanItem>(`/plans/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (id: number) =>
    api<{ success: boolean }>(`/plans/${id}`, { method: 'DELETE' }),
};

// ─── Diet API ───
export const dietApi = {
  getByDate: (date?: string) =>
    api<DietEntryItem[]>(`/diet${date ? `?date=${date}` : ''}`),

  getSummary: (date: string) =>
    api<DietSummary>(`/diet/summary?date=${date}`),

  getAnalytics: (startDate: string, endDate: string) =>
    api<unknown>(`/diet/analytics?startDate=${startDate}&endDate=${endDate}`),

  create: (data: Omit<DietEntryItem, 'id'>) =>
    api<DietEntryItem>('/diet', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: number, data: Partial<DietEntryItem>) =>
    api<DietEntryItem>(`/diet/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (id: number) =>
    api<{ success: boolean }>(`/diet/${id}`, { method: 'DELETE' }),
};

// ─── Profile API ───
export const profileApi = {
  getMe: () =>
    api<UserProfile>(`/profile/me`),

  updateTimezone: (timezone: string) =>
    api<{ timezone: string }>(`/profile/me/timezone`, {
      method: 'PUT',
      body: JSON.stringify({ timezone }),
    }),

  calculateNutrition: (data: {
    height: number;
    weight: number;
    age: number;
    gender: string;
    activityLevel: string;
    goal: string;
  }) =>
    api<{ profile: NutritionProfile; explanation: string }>(`/profile/me/nutrition`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// ─── Google Auth API ───
export const googleAuthApi = {
  getAuthUrl: () =>
    api<{ url: string }>('/google/auth-url'),

  disconnect: () =>
    api<{ success: boolean }>('/google/disconnect', { method: 'POST' }),
};

// ─── Finance API ───
export const financeApi = {
  getAccounts: () =>
    api<FinanceAccount[]>('/finance/accounts'),

  createAccount: (name: string, balance?: number) =>
    api<FinanceAccount>('/finance/accounts', {
      method: 'POST',
      body: JSON.stringify({ name, balance }),
    }),

  getCategories: (month: string) =>
    api<ExpenseCategory[]>(`/finance/categories?month=${month}`),

  createCategory: (data: { name: string; icon: string; color: string }) =>
    api<ExpenseCategory>('/finance/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateCategory: (id: number, data: Partial<{ name: string; icon: string; color: string }>) =>
    api<ExpenseCategory>(`/finance/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteCategory: (id: number) =>
    api<{ success: boolean }>(`/finance/categories/${id}`, {
      method: 'DELETE',
    }),

  getTransactions: (month: string) =>
    api<FinanceTransaction[]>(`/finance/transactions?month=${month}`),

  createTransaction: (data: {
    type: 'income' | 'expense';
    amount: number;
    comment?: string;
    date: string;
    accountId: number;
    categoryId?: number;
  }) =>
    api<{ transaction: FinanceTransaction; updatedAccount: FinanceAccount }>('/finance/transactions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteTransaction: (id: number) =>
    api<{ success: boolean }>(`/finance/transactions/${id}`, {
      method: 'DELETE',
    }),

  updateTransaction: (id: number, data: Partial<{ amount: number; comment: string; date: string }>) =>
    api<{ transaction: FinanceTransaction; updatedAccount: FinanceAccount | null }>(`/finance/transactions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getStats: (month: string) =>
    api<FinanceStats>(`/finance/stats?month=${month}`),

  getCategoryStats: (categoryId: number, month: string) =>
    api<CategoryStats>(`/finance/categories/${categoryId}/stats?month=${month}`),
};
