// User types
export interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'sales' | 'admin' | 'super_admin';
  organization_id: string;
}

// Lead types
export interface Lead {
  id: string;
  phone: string;
  status: 'RECEIVED' | 'CONTACTED' | 'QUALIFIED' | 'LOST';
  created_at: string;
  assigned_to?: string;
}

// Project types
export interface Project {
  id: string;
  project_number: string;
  customer_name?: string;
  status: 'DEMO' | 'SURVEYING' | 'QUOTING' | 'NEGOTIATING' | 'CONTRACTED';
  created_at: string;
}

// Quote types
export interface Quote {
  id: string;
  quote_number: string;
  status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'SENT';
  total_vnd: number;
  created_at: string;
}

// Auth types
export interface AuthResponse {
  token: string;
  user: User;
}
