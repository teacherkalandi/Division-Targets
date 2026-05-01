export type OfficeType = 'HO' | 'MDG' | 'Delivery S.O' | 'Non Delivery S.O' | 'BO';

export interface RevenueCategories {
  Parcel: number;
  MailOps: number;
  IRGB: number;
  CCS: number;
}

export interface SubDivisionData {
  [category: string]: RevenueCategories;
}

export interface ProcessedRevenueData {
  [subDivision: string]: SubDivisionData;
}
