/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Upload, ChevronDown, FileSpreadsheet, LayoutDashboard, Info, ExternalLink, CheckCircle2, RefreshCw, Search } from 'lucide-react';
import { ProcessedRevenueData, RevenueCategories, SubDivisionData } from './types';
import * as XLSX from 'xlsx';

const categories = ["HO", "MDG", "Delivery S.O", "Non Delivery S.O", "BO"];

const MONTHS = [
  "April, 2026", "May, 2026", "June, 2026", 
  "July, 2026", "August, 2026", "September, 2026",
  "October, 2026", "November, 2026", "December, 2026", 
  "January, 2027", "February, 2027", "March, 2027"
];

// Based on the provided image for Parcel distribution (Total 1.37 Cr)
const MONTHLY_WEIGHTS = [
  0.102408/1.37, 0.107716/1.37, 0.113196/1.37, 
  0.102408/1.37, 0.107716/1.37, 0.123985/1.37,
  0.151214/1.37, 0.161831/1.37, 0.134945/1.37, 
  0.086481/1.37, 0.081001/1.37, 0.097099/1.37
];

const POSB_MONTHLY = 185; // 1.85 Cr = 185 Lakhs (Flat)
const PLI_MONTHLY = 83;   // 0.83 Cr = 83 Lakhs (Flat)

const PAST_PERFORMANCE_DATA: Record<string, Record<string, { target: number, achievement: number }>> = {
  "ANGUL EAST": {
    "MailOps": { target: 104.144, achievement: 55.8771657 },
    "IRGB": { target: 11.280, achievement: 1.6322856 },
    "CCS": { target: 20.34933, achievement: 15.36337 },
    "Parcel": { target: 62.000, achievement: 22.098344 }
  },
  "ANGUL WEST": {
    "MailOps": { target: 30.260, achievement: 13.1614527 },
    "IRGB": { target: 6.000, achievement: 0.023006 },
    "CCS": { target: 5.65220, achievement: 2.66187 },
    "Parcel": { target: 22.900, achievement: 6.0224152 }
  },
  "DHENKANAL": {
    "MailOps": { target: 92.388, achievement: 39.0476529 },
    "IRGB": { target: 9.480, achievement: 0.648666 },
    "CCS": { target: 19.60720, achievement: 7.26053 },
    "Parcel": { target: 51.500, achievement: 10.9547855 }
  },
  "KAMAKHYA NAGAR": {
    "MailOps": { target: 25.984, achievement: 15.6291891 },
    "IRGB": { target: 6.600, achievement: 0.01905 },
    "CCS": { target: 2.18765, achievement: 0.47903 },
    "Parcel": { target: 21.500, achievement: 6.5939793 }
  },
  "TALCHER": {
    "MailOps": { target: 63.156, achievement: 36.8288486 },
    "IRGB": { target: 10.440, achievement: 0.6009967 },
    "CCS": { target: 6.19300, achievement: 1.47473 },
    "Parcel": { target: 43.97570, achievement: 12.3004737 }
  }
};

// Fuzzy matching to find the right sub-division data
const getPastPerformanceData = (subDivName: string) => {
  if (!subDivName) return null;
  const normalizedSearch = subDivName.toUpperCase().trim()
    .replace(/\s+SUB-DIVISION$/, '')
    .replace(/\s+SUB\s+DIVISION$/, '')
    .replace(/\s+SD$/, '');

  const key = Object.keys(PAST_PERFORMANCE_DATA).find(k => {
    const normalizedKey = k.toUpperCase().trim()
      .replace(/\s+SUB-DIVISION$/, '')
      .replace(/\s+SUB\s+DIVISION$/, '')
      .replace(/\s+SD$/, '');
    return normalizedKey === normalizedSearch || normalizedSearch.includes(normalizedKey) || normalizedKey.includes(normalizedSearch);
  });

  return key ? PAST_PERFORMANCE_DATA[key] : null;
};

const initialMockData: ProcessedRevenueData = {
  "ANGUL EAST": {
    "HO": { Parcel: 35.00, MailOps: 43.00, IRGB: 2.20, CCS: 13.69 },
    "MDG": { Parcel: 6.09, MailOps: 6.04, IRGB: 0.15, CCS: 6.92 },
    "Delivery S.O": { Parcel: 9.51, MailOps: 11.98, IRGB: 1.25, CCS: 27.25 },
    "Non Delivery S.O": { Parcel: 0.00, MailOps: 0.00, IRGB: 0.00, CCS: 0.00 },
    "BO": { Parcel: 11.39, MailOps: 3.12, IRGB: 0.00, CCS: 0.00 }
  }
};

const NON_DELIVERY_OFFICES = [
  { id: "26660617", name: "ANGUL BAZAR" },
  { id: "26660632", name: "DHENKANAL COLLEGE" },
  { id: "26660645", name: "JUBULI TOWN" }
];

export default function App() {
  const [view, setView] = useState<'subdiv' | 'division' | 'monthly' | 'target-details'>('subdiv');
  const [processedData, setProcessedData] = useState<ProcessedRevenueData>(initialMockData);
  const [officeWiseData, setOfficeWiseData] = useState<{
    Parcel: any[];
    MailOps: any[];
    IRGB: any[];
    CCS: any[];
  }>({ Parcel: [], MailOps: [], IRGB: [], CCS: [] });
  const [selectedVertical, setSelectedVertical] = useState<string | null>(null);
  const [increases, setIncreases] = useState<Record<string, Record<string, number>>>({});
  const [currentSubDiv, setCurrentSubDiv] = useState(Object.keys(initialMockData)[0]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [subDivSearch, setSubDivSearch] = useState('');
  const [monthlyLevel, setMonthlyLevel] = useState<'division' | 'subdiv'>('division');

  const parseValue = (val: any) => {
    if (val === undefined || val === null) return 0;
    const str = val.toString().trim();
    if (!str) return 0;
    const num = parseFloat(str.replace(/[₹,\s]/g, ""));
    return isNaN(num) ? 0 : num;
  };

  const formatVal = (val: number, precision: number = 2) => {
    return val.toFixed(precision);
  };

  const formatRupeeStr = (lakhs: number) => {
    const rupees = Math.round(lakhs * 100000);
    return new Intl.NumberFormat('en-IN').format(rupees);
  };

  const categorizeOffice = (officeId: string, officeName: string, typeStr: string) => {
    const id = officeId ? officeId.toString().trim() : "";
    const name = officeName ? officeName.toString().toUpperCase() : "";

    const isKnownND = NON_DELIVERY_OFFICES.some(nd => 
      id === nd.id || (name && name.includes(nd.name))
    );
    if (isKnownND) return 'Non Delivery S.O';

    if (!typeStr) return 'Delivery S.O';
    const t = typeStr.toUpperCase().trim();
    if (t.includes('HO') || t === 'HO') return 'HO';
    if (t.includes('MDG') || t === 'MDG') return 'MDG';
    if (t.includes('NON DELIVERY') || t.includes('NDSO')) return 'Non Delivery S.O';
    return 'Delivery S.O'; 
  };

  const fetchAndSync = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch('/api/sync-data');
      if (!response.ok) throw new Error("Sync failed");
      const raw = await response.json();
      
      const newData: ProcessedRevenueData = {};
      const newOfficeWise = { Parcel: [] as any[], MailOps: [] as any[], IRGB: [] as any[], CCS: [] as any[] };

      const initDiv = (div: string) => {
        const d = div.trim().toUpperCase();
        if (!newData[d]) {
          newData[d] = {
            'HO': { Parcel: 0, MailOps: 0, IRGB: 0, CCS: 0 },
            'MDG': { Parcel: 0, MailOps: 0, IRGB: 0, CCS: 0 },
            'Delivery S.O': { Parcel: 0, MailOps: 0, IRGB: 0, CCS: 0 },
            'Non Delivery S.O': { Parcel: 0, MailOps: 0, IRGB: 0, CCS: 0 },
            'BO': { Parcel: 0, MailOps: 0, IRGB: 0, CCS: 0 }
          };
        }
        return d;
      };

      if (raw.parcel && Array.isArray(raw.parcel)) {
        raw.parcel.forEach((row: any[]) => {
          const sl = Number(row[0]);
          if (isNaN(sl) || sl === 0) return;
          if (!row[4]) return;
          const div = initDiv(row[4]);
          const type = categorizeOffice(row[2], row[1], row[3]);
          
          const retailVal = parseValue(row[5]) / 100000;
          const contractualVal = parseValue(row[6]) / 100000;
          const speedPostVal = parseValue(row[7]) / 100000;
          const noOfBOs = parseValue(row[8]);
          const boIPP = parseValue(row[9]) / 100000;
          const boSPP = parseValue(row[10]) / 100000;
          const totalVal = parseValue(row[11]) / 100000;

          newData[div][type].Parcel += (retailVal + contractualVal + speedPostVal);
          newData[div]['BO'].Parcel += (boIPP + boSPP);
          
          if (totalVal > 0) {
            newOfficeWise.Parcel.push({ 
              sl: row[0],
              id: row[2],
              name: row[1], 
              subDiv: div, 
              category: type,
              type: row[3],
              target: totalVal,
              retail: retailVal,
              contractual: contractualVal,
              speedPost: speedPostVal,
              noOfBOs,
              boIPP,
              boSPP
            });
          }
        });
      }

      if (raw.mail && Array.isArray(raw.mail)) {
        raw.mail.forEach((row: any[]) => {
          const sl = Number(row[0]);
          if (isNaN(sl) || sl === 0) return;
          if (!row[4]) return;
          const div = initDiv(row[4]);
          const type = categorizeOffice(row[2], row[1], row[3]);
          const parentMail = parseValue(row[5]) / 100000;
          const parentIRGB = parseValue(row[6]) / 100000;
          const boMail = parseValue(row[8]) / 100000;
          newData[div][type].MailOps += parentMail;
          newData[div][type].IRGB += parentIRGB;
          newData[div]['BO'].MailOps += boMail;
          
          if (parentMail > 0) {
            newOfficeWise.MailOps.push({ 
              sl: row[0],
              id: row[2],
              name: row[1], 
              subDiv: div, 
              category: type,
              type: row[3],
              target: parentMail 
            });
          }
          if (parentIRGB > 0) {
            newOfficeWise.IRGB.push({ 
              sl: row[0],
              id: row[2],
              name: row[1], 
              subDiv: div, 
              category: type,
              type: row[3],
              target: parentIRGB 
            });
          }
          if (boMail > 0) {
            newOfficeWise.MailOps.push({ 
              sl: row[0],
              id: `${row[2]}-BO`,
              name: `${row[1]} (BO)`, 
              subDiv: div, 
              category: 'BO',
              type: 'BO',
              target: boMail 
            });
          }
        });
      }

      if (raw.ccs && Array.isArray(raw.ccs)) {
        raw.ccs.forEach((row: any[]) => {
          const sl = Number(row[0]);
          if (isNaN(sl) || sl === 0) return;
          if (!row[4]) return;
          const div = initDiv(row[4]);
          const type = categorizeOffice(row[2], row[1], row[3]);
          
          const aadhaarTxn = parseValue(row[5]);
          const aadhaarRev = parseValue(row[6]) / 100000;
          const popskTxn = parseValue(row[7]);
          const popskRev = parseValue(row[8]) / 100000;
          const retail = parseValue(row[9]) / 100000;
          const totalCCS = parseValue(row[10]) / 100000;
          
          newData[div][type].CCS += totalCCS;
          
          if (totalCCS > 0) {
            newOfficeWise.CCS.push({ 
              sl: row[0],
              id: row[2],
              name: row[1], 
              subDiv: div, 
              category: type,
              type: row[3],
              target: totalCCS,
              aadhaarTxn,
              aadhaarRev,
              popskTxn,
              popskRev,
              retail
            });
          }
        });
      }

      const subDivs = Object.keys(newData).sort();
      if (subDivs.length > 0) {
        setProcessedData(newData);
        setOfficeWiseData(newOfficeWise);
        if (!newData[currentSubDiv]) {
          setCurrentSubDiv(subDivs[0]);
        }
      }
    } catch (err) {
      console.error("Sync Error:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    fetchAndSync();
  }, []);

  const handleIncreaseChange = (category: string, value: string) => {
    const num = parseFloat(value) || 0;
    setIncreases(prev => ({
      ...prev,
      [currentSubDiv]: {
        ...(prev[currentSubDiv] || {}),
        [category]: num
      }
    }));
  };

  const currentData = processedData[currentSubDiv] || null;
  const subDivIncreases = increases[currentSubDiv] || {};

  const colTotals = useMemo(() => {
    if (!currentData) return null;
    const totals = { Parcel: 0, MailOps: 0, IRGB: 0, CCS: 0, Grand: 0 };
    categories.forEach(cat => {
      totals.Parcel += currentData[cat].Parcel;
      totals.MailOps += currentData[cat].MailOps;
      totals.IRGB += currentData[cat].IRGB;
      totals.CCS += currentData[cat].CCS;
    });
    totals.Grand = totals.Parcel + totals.MailOps + totals.IRGB + totals.CCS;
    return totals;
  }, [currentData]);

  const divisionData = useMemo(() => {
    const divs = Object.keys(processedData).sort();
    const rows = divs.map(div => {
      const subdivData = processedData[div];
      const totals = { Parcel: 0, MailOps: 0, IRGB: 0, CCS: 0 };
      Object.values(subdivData).forEach(cat => {
        totals.Parcel += cat.Parcel;
        totals.MailOps += cat.MailOps;
        totals.IRGB += cat.IRGB;
        totals.CCS += cat.CCS;
      });
      return { 
        name: div, 
        ...totals, 
        total: totals.Parcel + totals.MailOps + totals.IRGB + totals.CCS 
      };
    });

    const grand = rows.reduce((acc, curr) => ({
      Parcel: acc.Parcel + curr.Parcel,
      MailOps: acc.MailOps + curr.MailOps,
      IRGB: acc.IRGB + curr.IRGB,
      CCS: acc.CCS + curr.CCS,
      total: acc.total + curr.total
    }), { Parcel: 0, MailOps: 0, IRGB: 0, CCS: 0, total: 0 });

    return { rows, grand };
  }, [processedData]);

  const monthlyData = useMemo(() => {
    // Current annual totals to distribute
    let annualTotals = { Parcel: 0, MailOps: 0, IRGB: 0, CCS: 0 };
    
    if (monthlyLevel === 'division') {
      annualTotals = divisionData.grand;
    } else if (currentData) {
      categories.forEach(cat => {
        annualTotals.Parcel += currentData[cat].Parcel;
        annualTotals.MailOps += currentData[cat].MailOps;
        annualTotals.IRGB += currentData[cat].IRGB;
        annualTotals.CCS += currentData[cat].CCS;
      });
    }

    const rows = MONTHS.map((month, idx) => {
      const weight = MONTHLY_WEIGHTS[idx];
      const row = {
        month,
        Parcel: annualTotals.Parcel * weight,
        MailOps: annualTotals.MailOps * weight,
        IRGB: annualTotals.IRGB * weight,
        CCS: annualTotals.CCS * weight,
        // POSB and PLI are division-wide and flat as per image
        POSB: monthlyLevel === 'division' ? POSB_MONTHLY : 0, 
        PLI: monthlyLevel === 'division' ? PLI_MONTHLY : 0,
        total: 0
      };
      row.total = row.Parcel + row.MailOps + row.IRGB + row.CCS + row.POSB + row.PLI;
      return row;
    });

    const grand = rows.reduce((acc, curr) => ({
      Parcel: acc.Parcel + curr.Parcel,
      MailOps: acc.MailOps + curr.MailOps,
      IRGB: acc.IRGB + curr.IRGB,
      CCS: acc.CCS + curr.CCS,
      POSB: acc.POSB + curr.POSB,
      PLI: acc.PLI + curr.PLI,
      total: acc.total + curr.total
    }), { Parcel: 0, MailOps: 0, IRGB: 0, CCS: 0, POSB: 0, PLI: 0, total: 0 });

    return { rows, grand };
  }, [monthlyLevel, currentData, divisionData.grand]);

  const handleDownloadExcel = () => {
    const wb = XLSX.utils.book_new();
    const fileName = `IndiaPost-Comprehensive-Report-${new Date().toISOString().split('T')[0]}.xlsx`;

    // SHEET 1: Division Summary
    const divRows = divisionData.rows.map(row => ({
      'Sub-Division': row.name,
      'Parcel': formatVal(row.Parcel/100, 4),
      'Mail Ops': formatVal(row.MailOps/100, 4),
      'IR & GB': formatVal(row.IRGB/100, 4),
      'CCS': formatVal(row.CCS/100, 4),
      'Total': formatVal(row.total/100, 4)
    }));
    divRows.push({
      'Sub-Division': 'GRAND TOTAL',
      'Parcel': formatVal(divisionData.grand.Parcel/100, 4),
      'Mail Ops': formatVal(divisionData.grand.MailOps/100, 4),
      'IR & GB': formatVal(divisionData.grand.IRGB/100, 4),
      'CCS': formatVal(divisionData.grand.CCS/100, 4),
      'Total': formatVal(divisionData.grand.total/100, 4)
    });
    const wsDiv = XLSX.utils.json_to_sheet(divRows);
    XLSX.utils.book_append_sheet(wb, wsDiv, "Division Summary");

    // SHEET 2: Division Vertical Targets
    const pastEntries = Object.entries(PAST_PERFORMANCE_DATA).filter(([key]) => {
      const hasRealData = Object.keys(PAST_PERFORMANCE_DATA).length > 1;
      return hasRealData ? key !== "SAMPLE SUB-DIVISION" : true;
    });

    const divVerticalData = ['Parcel', 'MailOps', 'IRGB', 'CCS'].map(vertical => {
      const pastTarget = pastEntries.reduce((acc, [_, sub]) => acc + (sub[vertical]?.target || 0), 0);
      const pastAchiev = pastEntries.reduce((acc, [_, sub]) => acc + (sub[vertical]?.achievement || 0), 0);
      const currentTarget = (divisionData.grand as any)[vertical];
      const increase = pastTarget > 0 ? ((currentTarget - pastTarget) / pastTarget * 100) : 0;
      
      return {
        'Vertical': vertical === 'MailOps' ? 'Mail Operations' : vertical === 'IRGB' ? 'IR & GB' : vertical,
        'Annual Target 25-26': formatVal(pastTarget/100, 4),
        'Achievement 25-26': formatVal(pastAchiev/100, 4),
        'Annual Target 26-27': formatVal(currentTarget/100, 4),
        '% Increase': `${increase.toFixed(2)}%`
      };
    });
    const wsDivVert = XLSX.utils.json_to_sheet(divVerticalData);
    XLSX.utils.book_append_sheet(wb, wsDivVert, "Division Vertical Targets");

    // SHEET 3: Sub-Division Detail (Current Selection)
    if (currentData && colTotals) {
      const categoryData = categories.map(cat => {
        const rowData = currentData[cat];
        return {
          'Office Type': cat,
          'Parcel': formatVal(rowData.Parcel, 3),
          'Mail Ops': formatVal(rowData.MailOps, 3),
          'IR & GB': formatVal(rowData.IRGB, 3),
          'CCS': formatVal(rowData.CCS, 3),
          'Total': formatVal(rowData.Parcel + rowData.MailOps + rowData.IRGB + rowData.CCS, 3)
        };
      });
      categoryData.push({
        'Office Type': 'GRAND TOTAL',
        'Parcel': formatVal(colTotals.Parcel, 3),
        'Mail Ops': formatVal(colTotals.MailOps, 3),
        'IR & GB': formatVal(colTotals.IRGB, 3),
        'CCS': formatVal(colTotals.CCS, 3),
        'Total': formatVal(colTotals.Grand, 3)
      });
      const wsSub = XLSX.utils.json_to_sheet(categoryData);
      XLSX.utils.book_append_sheet(wb, wsSub, `${currentSubDiv.substring(0, 20)} Details`);

      const subDivPast = getPastPerformanceData(currentSubDiv) || {};
      const verticalData = [
        { key: 'Parcel', label: 'Parcel' },
        { key: 'MailOps', label: 'Mail Operations' },
        { key: 'IRGB', label: 'IR & GB' },
        { key: 'CCS', label: 'CCS' }
      ].map(row => {
        const past = subDivPast[row.key] || { target: 0, achievement: 0 };
        const currentTarget = (colTotals as any)[row.key];
        const increase = past.target > 0 ? ((currentTarget - past.target) / past.target * 100) : 0;
        return {
          'Vertical': row.label,
          'Annual Target 25-26': formatVal(past.target, 3),
          'Achievement 25-26': formatVal(past.achievement, 3),
          'Annual Target 26-27': formatVal(currentTarget, 3),
          '% Increase': `${formatVal(increase, 2)}%`
        };
      });
      const wsVert = XLSX.utils.json_to_sheet(verticalData);
      XLSX.utils.book_append_sheet(wb, wsVert, `${currentSubDiv.substring(0, 20)} Targets`);
    }

    // SHEET 3: Monthly Targets (Division Level)
    const monthlyRows = monthlyData.rows.map(row => ({
      'Month': row.month,
      'Parcel': formatVal(row.Parcel, 3),
      'Mail Ops': formatVal(row.MailOps, 3),
      'IR & GB': formatVal(row.IRGB, 3),
      'CCS': formatVal(row.CCS, 3),
      'POSB': formatVal(row.POSB, 2),
      'PLI': formatVal(row.PLI, 2),
      'Total': formatVal(row.total, 3)
    }));
    const wsMonth = XLSX.utils.json_to_sheet(monthlyRows);
    XLSX.utils.book_append_sheet(wb, wsMonth, "Monthly Targets");

    XLSX.writeFile(wb, fileName);
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans">
      <div className="max-w-5xl mx-auto mb-6 print:hidden flex flex-wrap justify-between items-center bg-white p-4 rounded-lg shadow-sm border border-slate-200 gap-4">
        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4">
          <div className="flex flex-wrap bg-slate-100 p-1 rounded-xl w-full sm:w-auto">
            <button 
              onClick={() => setView('subdiv')}
              className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-widest transition ${view === 'subdiv' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Sub-Division
            </button>
            <button 
              onClick={() => setView('division')}
              className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-widest transition ${view === 'division' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Summary
            </button>
            <button 
              onClick={() => setView('monthly')}
              className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-widest transition ${view === 'monthly' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Monthly
            </button>
            <button 
              onClick={() => setView('target-details')}
              className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-widest transition ${view === 'target-details' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Details
            </button>
          </div>

          {(view === 'subdiv' || (view === 'monthly' && monthlyLevel === 'subdiv')) && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
              <label className="font-bold text-slate-500 uppercase text-[9px] sm:text-[10px] tracking-widest">Select Sub-Division:</label>
              <div className="relative w-full sm:min-w-[200px]">
                <select 
                  className="w-full appearance-none bg-slate-50 border border-slate-300 text-slate-800 py-2.5 pl-4 pr-10 rounded-lg font-bold focus:outline-none focus:ring-2 focus:ring-red-500 cursor-pointer"
                  value={currentSubDiv}
                  onChange={(e) => setCurrentSubDiv(e.target.value)}
                >
                  {Object.keys(processedData).sort().map(div => (
                    <option key={div} value={div}>{div}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-3 text-slate-500 pointer-events-none" size={18} />
              </div>
            </div>
          )}
        </div>
        
        <div className="flex flex-wrap gap-3">
          <button 
            onClick={fetchAndSync}
            disabled={isSyncing}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow transition flex items-center gap-2 disabled:opacity-50 text-sm"
          >
            <RefreshCw size={18} className={isSyncing ? 'animate-spin' : ''} /> {isSyncing ? 'Sync Data' : 'Sync Data'}
          </button>
          <button 
            onClick={handleDownloadExcel}
            className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg shadow transition flex items-center gap-2 text-sm"
          >
            <FileSpreadsheet size={18} /> Excel
          </button>
        </div>
      </div>

      <div id="report-container" className="max-w-5xl mx-auto bg-white p-4 md:p-12 rounded-2xl shadow-xl border border-slate-200 print:shadow-none print:p-0 print:border-none">
        
        {view === 'subdiv' ? (
          <div>
            <div className="mb-6 md:mb-10 border-b-4 border-red-600 pb-6 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
              <div>
                <h2 className="text-2xl md:text-4xl font-black text-red-600 uppercase tracking-tight leading-tight mb-1">Revenue Target</h2>
                <p className="text-lg md:text-2xl text-slate-900 font-bold uppercase tracking-wide">Sub-Division: {currentSubDiv}</p>
              </div>
              <div className="flex flex-row md:flex-col justify-between w-full md:w-auto items-center md:items-end gap-2">
                 <div className="bg-red-600 text-white px-3 py-1 rounded-md text-[10px] md:text-xs font-black uppercase">FY 2026-27</div>
                 <div className="text-emerald-600 font-black text-xs md:text-sm uppercase tracking-widest">₹ In Lakhs</div>
              </div>
            </div>

            {currentData && colTotals ? (
              <div className="space-y-12">
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-black text-slate-800 text-lg uppercase flex items-center gap-2">
                      <span className="bg-red-600 w-2 h-6 inline-block"></span>
                      I. Office Category-wise Distribution
                    </h3>
                    <button 
                      onClick={() => {
                        const categoryData = categories.map(cat => {
                          const rowData = currentData[cat];
                          return {
                            'Office Type': cat,
                            'Parcel': formatVal(rowData.Parcel, 2),
                            'Mail Ops': formatVal(rowData.MailOps, 2),
                            'IR & GB': formatVal(rowData.IRGB, 2),
                            'CCS': formatVal(rowData.CCS, 2),
                            'Total': formatVal(rowData.Parcel + rowData.MailOps + rowData.IRGB + rowData.CCS, 2)
                          };
                        });
                        categoryData.push({
                          'Office Type': 'GRAND TOTAL',
                          'Parcel': formatVal(colTotals.Parcel, 2),
                          'Mail Ops': formatVal(colTotals.MailOps, 2),
                          'IR & GB': formatVal(colTotals.IRGB, 2),
                          'CCS': formatVal(colTotals.CCS, 2),
                          'Total': formatVal(colTotals.Grand, 2)
                        });
                        const ws = XLSX.utils.json_to_sheet(categoryData);
                        const wb = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(wb, ws, "Office Distribution");
                        XLSX.writeFile(wb, `${currentSubDiv}-Office-Distribution.xlsx`);
                      }}
                      className="p-1.5 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-colors"
                      title="Download Excel for this section"
                    >
                      <FileSpreadsheet size={18} />
                    </button>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-slate-300">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-red-600 text-white">
                          <th className="p-4 text-left font-bold uppercase tracking-wider">Office Type</th>
                          <th className="p-4 text-center font-bold uppercase">Parcel</th>
                          <th className="p-4 text-center font-bold uppercase">Mail Ops</th>
                          <th className="p-4 text-center font-bold uppercase">IR & GB</th>
                          <th className="p-4 text-center font-bold uppercase">CCS</th>
                          <th className="p-4 text-center font-bold uppercase bg-red-700">Total</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm">
                        {categories.map((cat, idx) => {
                          const rowTotal = currentData[cat].Parcel + currentData[cat].MailOps + currentData[cat].IRGB + currentData[cat].CCS;
                          return (
                            <tr key={cat} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                              <td className="p-4 font-bold text-slate-700 border-r border-slate-200 uppercase">
                                {cat}
                                {cat === 'Non Delivery S.O' && <span className="block text-[8px] font-normal text-slate-400 mt-0.5">(Includes Angul Bazar, Dhenkanal College, Jubuli Town)</span>}
                              </td>
                              <td className="p-4 text-center border-r border-slate-200 font-mono">{formatVal(currentData[cat].Parcel, 2)}</td>
                              <td className="p-4 text-center border-r border-slate-200 font-mono">{formatVal(currentData[cat].MailOps, 2)}</td>
                              <td className="p-4 text-center border-r border-slate-200 font-mono">{formatVal(currentData[cat].IRGB, 2)}</td>
                              <td className="p-4 text-center border-r border-slate-200 font-mono">{formatVal(currentData[cat].CCS, 2)}</td>
                              <td className="p-4 text-center font-black bg-slate-100 text-slate-900 font-mono">{formatVal(rowTotal, 2)}</td>
                            </tr>
                          );
                        })}
                        <tr className="bg-amber-50 font-black text-red-700 border-t-2 border-red-200">
                          <td className="p-4 text-center uppercase tracking-widest ">Grand Total</td>
                          <td className="p-4 text-center font-mono">{formatVal(colTotals.Parcel, 2)}</td>
                          <td className="p-4 text-center font-mono">{formatVal(colTotals.MailOps, 2)}</td>
                          <td className="p-4 text-center font-mono">{formatVal(colTotals.IRGB, 2)}</td>
                          <td className="p-4 text-center font-mono">{formatVal(colTotals.CCS, 2)}</td>
                          <td className="p-4 text-center text-xl font-black font-mono">{formatVal(colTotals.Grand, 2)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-start">
                <div>
                  <div className="bg-red-800 text-white flex justify-between items-center px-6 py-4 rounded-t-lg shadow-md">
                    <h3 className="font-black text-xl uppercase tracking-widest">Vertical-wise Target (2026-27)</h3>
                    <div className="flex gap-2">
                       <button 
                         onClick={() => {
                           const subDivPast = getPastPerformanceData(currentSubDiv) || {};
                           const data = [
                             ['Vertical', 'Annual Target 25-26', 'Achievement 25-26', 'Annual Target 26-27', '% Increase'],
                             ...[
                               { key: 'Parcel', label: 'Parcel' },
                               { key: 'MailOps', label: 'Mail Operations' },
                               { key: 'IRGB', label: 'IR & GB' },
                               { key: 'CCS', label: 'CCS' }
                             ].map(row => {
                               const past = subDivPast[row.key] || { target: 0, achievement: 0 };
                               const currentTarget = (colTotals as any)[row.key];
                               const increase = past.target > 0 ? ((currentTarget - past.target) / past.target * 100) : 0;
                               return [row.label, formatVal(past.target, 3), formatVal(past.achievement, 3), formatVal(currentTarget, 3), `${increase.toFixed(2)}%`];
                             })
                           ];
                           const ws = XLSX.utils.aoa_to_sheet(data);
                           const wb = XLSX.utils.book_new();
                           XLSX.utils.book_append_sheet(wb, ws, "Vertical Targets");
                           XLSX.writeFile(wb, `${currentSubDiv}-Vertical-Targets.xlsx`);
                         }}
                         className="p-1.5 bg-white/20 hover:bg-white/40 rounded transition-colors"
                         title="Download spreadsheet for this section"
                       >
                         <FileSpreadsheet size={16} />
                       </button>
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-b-lg border border-slate-300 bg-white">
                    <table className="w-full border-collapse text-[10px]">
                      <thead>
                        <tr className="bg-slate-50 border-b-2 border-slate-200">
                          <th className="p-4 text-left font-black text-slate-700 uppercase border-r border-slate-100 w-1/4">Name of Vertical</th>
                          <th className="p-4 text-center font-black text-slate-700 uppercase border-r border-slate-100">Annual Target 2025-26 (₹ in Lakhs)</th>
                          <th className="p-4 text-center font-black text-slate-700 uppercase border-r border-slate-100">Achievement 2025-26 (₹ in Lakhs)</th>
                          <th className="p-4 text-center font-black text-slate-700 uppercase border-r border-slate-100">Annual Target 2026-27 (₹ in Lakhs)</th>
                          <th className="p-4 text-center font-black text-slate-700 uppercase">% Increase in Target</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { key: 'Parcel', label: 'Parcel', val: colTotals.Parcel },
                          { key: 'MailOps', label: 'Mail Operations (Speed Post)', val: colTotals.MailOps },
                          { key: 'IRGB', label: 'IR & GB (Int. Mail)', val: colTotals.IRGB },
                          { key: 'CCS', label: 'CCS', val: colTotals.CCS }
                        ].map((row, idx) => {
                          const subDivPast = getPastPerformanceData(currentSubDiv);
                          const past = subDivPast ? subDivPast[row.key] : { target: 0, achievement: 0 };
                          const increase = past.target > 0 ? ((row.val - past.target) / past.target * 100) : 0;
                          return (
                            <tr key={row.key} className={idx % 2 === 0 ? "bg-slate-50/50" : "bg-white"}>
                              <td className="p-4 pl-6 text-slate-900 font-bold uppercase border-r border-slate-200">{row.label}</td>
                            <td className="p-4 text-center font-mono border-r border-slate-200">{formatVal(past.target, 3)}</td>
                            <td className="p-4 text-center font-mono border-r border-slate-200">{formatVal(past.achievement, 3)}</td>
                            <td className="p-4 text-center font-mono font-black border-r border-slate-200 bg-blue-50/30 text-blue-900">{formatVal(row.val, 3)}</td>
                              <td className={`p-4 text-center font-mono font-black ${increase >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                {increase >= 0 ? '+' : ''}{increase.toFixed(2)}%
                              </td>
                            </tr>
                          );
                        })}
                        {(() => {
                          const subDivPast = getPastPerformanceData(currentSubDiv) || {};
                          const pastTotalTarget = Object.values(subDivPast).reduce((a, b: any) => a + (b.target || 0), 0);
                          const pastTotalAchiev = Object.values(subDivPast).reduce((a, b: any) => a + (b.achievement || 0), 0);
                          const totalIncr = pastTotalTarget > 0 ? ((colTotals.Grand - pastTotalTarget) / pastTotalTarget * 100) : 0;
                          return (
                            <tr className="bg-slate-100 font-black border-t-2 border-slate-400 text-xs">
                              <td className="p-4 pl-6 text-slate-900 uppercase border-r border-slate-300">Total Year</td>
                              <td className="p-4 text-center font-mono border-r border-slate-300">{formatVal(pastTotalTarget, 3)}</td>
                              <td className="p-4 text-center font-mono border-r border-slate-300">{formatVal(pastTotalAchiev, 3)}</td>
                              <td className="p-4 text-center font-mono border-r border-slate-300 bg-blue-100 text-blue-950">{formatVal(colTotals.Grand, 3)}</td>
                              <td className="p-4 text-center font-mono text-blue-800">+{formatVal(totalIncr, 2)}%</td>
                            </tr>
                          );
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>

                  <div className="space-y-4">
                     <h3 className="font-black text-slate-800 text-lg uppercase flex items-center gap-2">
                        <span className="bg-amber-400 w-2 h-6 inline-block"></span>
                        Operational Summary
                     </h3>
                     <div className="bg-slate-900 p-6 rounded-2xl text-slate-300 text-xs space-y-4 shadow-inner">
                        <p className="flex gap-2">
                          <CheckCircle2 className="text-emerald-500 shrink-0" size={16}/>
                          <span><strong>Non-Delivery Mapping:</strong> Angul Bazar, Dhenkanal College, and Jubuli Town are correctly categorized as Non-Delivery.</span>
                        </p>
                        <p className="flex gap-2">
                          <CheckCircle2 className="text-emerald-500 shrink-0" size={16}/>
                          <span><strong>BO Split:</strong> Branch Office targets are isolated using specific column logic.</span>
                        </p>
                        <p className="flex gap-2">
                          <CheckCircle2 className="text-emerald-500 shrink-0" size={16}/>
                          <span><strong>Units:</strong> All monetary values are presented in <strong>₹ Lakhs</strong>.</span>
                        </p>
                     </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-20 text-center">
                <p className="text-slate-400 italic text-xl">Please sync data to display the report.</p>
              </div>
            )}
          </div>
        ) : view === 'division' ? (
          <div className="space-y-8 md:space-y-12">
            <div className="mb-6 md:mb-10 border-b-4 border-red-600 pb-6 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
              <div>
                <h2 className="text-2xl md:text-4xl font-black text-red-600 uppercase tracking-tight leading-tight mb-1">Division Summary</h2>
                <p className="text-lg md:text-2xl text-slate-900 font-bold uppercase tracking-wide">Comprehensive Target View</p>
              </div>
              <div className="flex flex-row md:flex-col justify-between w-full md:w-auto items-center md:items-end gap-2">
                 <div className="bg-red-600 text-white px-3 py-1 rounded-md text-[10px] md:text-xs font-black uppercase">Entire Division</div>
                 <div className="text-emerald-600 font-black text-xs md:text-sm uppercase tracking-widest">₹ In Crores</div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-300 mb-12">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-red-600 text-white">
                    <th className="p-4 text-left font-bold uppercase tracking-wider">Name of Sub Dvn</th>
                    <th className="p-4 text-center font-bold uppercase">Parcel</th>
                    <th className="p-4 text-center font-bold uppercase">Mail Ops</th>
                    <th className="p-4 text-center font-bold uppercase">IR & GB</th>
                    <th className="p-4 text-center font-bold uppercase">CCS</th>
                    <th className="p-4 text-center font-bold uppercase bg-red-700">Total</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {divisionData.rows.map((row, idx) => (
                    <tr key={row.name} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                      <td className="p-4 font-bold text-slate-700 border-r border-slate-200 uppercase">{row.name}</td>
                      <td className="p-4 text-center border-r border-slate-200 font-mono">{formatVal(row.Parcel/100, 4)}</td>
                      <td className="p-4 text-center border-r border-slate-200 font-mono">{formatVal(row.MailOps/100, 4)}</td>
                      <td className="p-4 text-center border-r border-slate-200 font-mono">{formatVal(row.IRGB/100, 4)}</td>
                      <td className="p-4 text-center border-r border-slate-200 font-mono">{formatVal(row.CCS/100, 4)}</td>
                      <td className="p-4 text-center font-black bg-slate-100 text-slate-900 font-mono">{formatVal(row.total/100, 4)}</td>
                    </tr>
                  ))}
                  <tr className="bg-amber-50 font-black text-red-700 border-t-2 border-red-200 text-base">
                    <td className="p-4 text-center uppercase tracking-widest">Grand Total</td>
                    <td className="p-4 text-center font-mono">{formatVal(divisionData.grand.Parcel/100, 4)}</td>
                    <td className="p-4 text-center font-mono">{formatVal(divisionData.grand.MailOps/100, 4)}</td>
                    <td className="p-4 text-center font-mono">{formatVal(divisionData.grand.IRGB/100, 4)}</td>
                    <td className="p-4 text-center font-mono">{formatVal(divisionData.grand.CCS/100, 4)}</td>
                    <td className="p-4 text-center text-2xl font-black font-mono">{formatVal(divisionData.grand.total/100, 4)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="bg-slate-50 p-8 rounded-2xl border border-slate-200">
               <h3 className="font-black text-slate-800 text-lg uppercase mb-6 flex items-center gap-2">
                  <span className="bg-amber-500 w-2 h-6 inline-block"></span>
                  III. Division Performance Growth Plan (FY 2025-26 vs FY 2026-27)
               </h3>
               <div className="bg-red-700 text-white text-center py-3 rounded-t-lg">
                  <h3 className="font-black text-xl uppercase tracking-tighter">Vertical-wise Target (2026-27) - Division Total</h3>
               </div>
               <div className="overflow-x-auto rounded-b-lg border border-slate-300 bg-white">
                  <table className="w-full border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-slate-50 border-b-2 border-slate-300">
                        <th className="p-3 text-left font-black text-slate-800 uppercase tracking-tighter border-r border-slate-300 w-1/4">Name of Vertical</th>
                        <th className="p-3 text-center font-black text-slate-800 uppercase tracking-tighter border-r border-slate-300">Annual Target 2025-26 (₹ in Crores)</th>
                        <th className="p-3 text-center font-black text-slate-800 uppercase tracking-tighter border-r border-slate-300">Achievement 2025-26 (₹ in Crores)</th>
                        <th className="p-3 text-center font-black text-slate-800 uppercase tracking-tighter border-r border-slate-300">Annual Target 2026-27 (₹ in Crores)</th>
                        <th className="p-3 text-center font-black text-slate-800 uppercase tracking-tighter">% Increase in Target</th>
                      </tr>
                    </thead>
                    <tbody>
                      {['Parcel', 'MailOps', 'IRGB', 'CCS'].map((vertical) => {
                        // Filter out sample data from grand total calculation if real data exists
                        const pastEntries = Object.entries(PAST_PERFORMANCE_DATA).filter(([key]) => {
                          const hasRealData = Object.keys(PAST_PERFORMANCE_DATA).length > 1;
                          return hasRealData ? key !== "SAMPLE SUB-DIVISION" : true;
                        });

                        const pastGrandTarget = pastEntries.reduce((acc, [_, sub]) => acc + (sub[vertical]?.target || 0), 0);
                        const pastGrandAchiev = pastEntries.reduce((acc, [_, sub]) => acc + (sub[vertical]?.achievement || 0), 0);
                        const currentTarget = (divisionData.grand as any)[vertical === 'MailOps' ? 'MailOps' : vertical === 'IRGB' ? 'IRGB' : vertical === 'CCS' ? 'CCS' : 'Parcel'];
                        const increase = pastGrandTarget > 0 ? ((currentTarget - pastGrandTarget) / pastGrandTarget * 100) : 0;
                        
                        return (
                          <tr key={vertical} className="border-b border-slate-200 hover:bg-slate-50 transition-colors">
                            <td className="p-4 pl-6 font-bold text-slate-900 uppercase border-r border-slate-200">{vertical === 'MailOps' ? 'Mail Operations' : vertical === 'IRGB' ? 'IR & GB' : vertical}</td>
                            <td className="p-4 text-center font-mono border-r border-slate-200">{formatVal(pastGrandTarget/100, 4)}</td>
                            <td className="p-4 text-center font-mono border-r border-slate-200">{formatVal(pastGrandAchiev/100, 4)}</td>
                            <td className="p-4 text-center font-mono font-black border-r border-slate-200 bg-blue-50/30 text-blue-900">{formatVal(currentTarget/100, 4)}</td>
                            <td className={`p-4 text-center font-mono font-black ${increase >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                              {increase >= 0 ? '+' : ''}{increase.toFixed(2)}%
                            </td>
                          </tr>
                        );
                      })}
                      {(() => {
                        const pastEntries = Object.entries(PAST_PERFORMANCE_DATA).filter(([key]) => {
                          const hasRealData = Object.keys(PAST_PERFORMANCE_DATA).length > 1;
                          return hasRealData ? key !== "SAMPLE SUB-DIVISION" : true;
                        });

                        const totalPastTarget = pastEntries.reduce(
                          (sum, [_, sub]) => sum + Object.values(sub).reduce((s, p) => s + p.target, 0), 
                          0
                        );
                        const totalPastAchiev = pastEntries.reduce(
                          (sum, [_, sub]) => sum + Object.values(sub).reduce((s, p) => s + p.achievement, 0), 
                          0
                        );
                        const totalIncrease = totalPastTarget > 0 ? ((divisionData.grand.total - totalPastTarget) / totalPastTarget * 100) : 0;
                        return (
                          <tr className="bg-slate-100 text-slate-900 font-black border-t-2 border-slate-400">
                            <td className="p-5 pl-6 uppercase tracking-widest border-r border-slate-300">Division Total</td>
                            <td className="p-5 text-center font-mono border-r border-slate-300">{formatVal(totalPastTarget/100, 4)}</td>
                            <td className="p-5 text-center font-mono border-r border-slate-300">{formatVal(totalPastAchiev/100, 4)}</td>
                            <td className="p-5 text-center font-mono border-r border-slate-300 bg-blue-100 text-blue-950">{formatVal(divisionData.grand.total/100, 4)}</td>
                            <td className="p-5 text-center font-mono text-blue-800">+{formatVal(totalIncrease, 2)}%</td>
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
               </div>
            </div>

            <div className="bg-slate-50 p-8 rounded-2xl border border-slate-200 mt-8">
               <h3 className="font-black text-slate-800 text-lg uppercase mb-6 flex items-center gap-2">
                  <span className="bg-amber-500 w-2 h-6 inline-block"></span>
                  IV. Division Highlights
               </h3>
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                  <DivStat label="Leading Sub-Division" value={divisionData.rows.reduce((a, b) => a.total > b.total ? a : b, {name: 'N/A', total: 0}).name} color="red" />
                  <DivStat label="Highest Parcel Revenue" value={divisionData.rows.reduce((a, b) => a.Parcel > b.Parcel ? a : b, {name: 'N/A', Parcel: 0}).name} color="amber" />
                  <DivStat label="Revenue Efficiency" value="98.2%" color="emerald" />
                  <DivStat label="Total Operational Units" value="238" color="orange" />
               </div>
            </div>
          </div>
        ) : view === 'target-details' ? (
          <div>
            <div className="mb-6 md:mb-10 border-b-4 border-red-600 pb-6 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
              <div>
                <h2 className="text-2xl md:text-4xl font-black text-red-600 uppercase tracking-tight leading-tight mb-1">Target Details</h2>
                <p className="text-lg md:text-2xl text-slate-900 font-bold uppercase tracking-wide">Office-wise Vertical Targets</p>
              </div>
              <div className="flex flex-row md:flex-col justify-between w-full md:w-auto items-center md:items-end gap-2">
                <div className="bg-red-600 text-white px-3 py-1 rounded-md text-[10px] md:text-xs font-black uppercase">FY 2026-27</div>
                <div className="text-emerald-600 font-black text-xs md:text-sm uppercase tracking-widest">₹ In Rupees</div>
              </div>
            </div>

            {!selectedVertical ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                {[
                  { id: 'Parcel', label: 'Parcels', icon: '📦', color: 'bg-blue-600', count: officeWiseData.Parcel.length },
                  { id: 'MailOps', label: 'Mails', icon: '✉️', color: 'bg-red-600', count: officeWiseData.MailOps.length },
                  { id: 'IRGB', label: 'IR & GB', icon: '🌐', color: 'bg-emerald-600', count: officeWiseData.IRGB.length },
                  { id: 'CCS', label: 'CCS', icon: '🏪', color: 'bg-amber-600', count: officeWiseData.CCS.length }
                ].map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVertical(v.id)}
                    className="group relative overflow-hidden bg-white p-6 sm:p-8 rounded-2xl shadow-lg border border-slate-200 hover:border-slate-300 transition-all text-left flex flex-col h-40 sm:h-48 justify-between"
                  >
                    <div className={`${v.color} w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-xl sm:text-2xl shadow-lg group-hover:scale-110 transition-transform`}>
                      {v.icon}
                    </div>
                    <div>
                      <h4 className="text-lg sm:text-xl font-black text-slate-800 uppercase tracking-tight">{v.label}</h4>
                      <p className="text-[10px] sm:text-xs text-slate-500 font-bold uppercase tracking-widest mb-1">{v.count} Offices </p>
                      <div className="w-8 h-1 bg-slate-200 group-hover:w-16 group-hover:bg-red-600 transition-all duration-300"></div>
                    </div>
                    <div className="absolute -right-4 -bottom-4 text-8xl opacity-5 group-hover:opacity-10 transition-opacity">
                      {v.icon}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setSelectedVertical(null)}
                      className="p-2 hover:bg-slate-200 rounded-lg transition"
                    >
                      <LayoutDashboard size={20} className="text-slate-600" />
                    </button>
                    <div>
                      <h3 className="font-black text-slate-800 text-lg uppercase flex items-center gap-2">
                        {selectedVertical === 'Parcel' ? 'Parcels' : selectedVertical === 'MailOps' ? 'Mails' : selectedVertical} Office Targets
                      </h3>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Showing all tracked offices for this vertical</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                    <div className="relative">
                      <input 
                        type="text"
                        placeholder="Search Sub-Division..."
                        className="bg-white border border-slate-300 rounded-lg px-4 py-2 pl-10 text-xs focus:ring-2 focus:ring-red-500 focus:outline-none min-w-[180px] shadow-sm"
                        value={subDivSearch}
                        onChange={(e) => setSubDivSearch(e.target.value)}
                      />
                      <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
                    </div>
                    <button 
                      onClick={() => {
                        const data = officeWiseData[selectedVertical as keyof typeof officeWiseData]
                          .sort((a, b) => (Number(a.sl) || 9999) - (Number(b.sl) || 9999))
                          .map(o => {
                            const basic = {
                              'Sl No': o.sl,
                              'Name of Office': o.name,
                              'Office ID': o.id,
                              'Office Type': o.type,
                              'Sub-Division': o.subDiv,
                            };
                            
                            if (selectedVertical === 'Parcel') {
                              return {
                                'Sl No': o.sl,
                                'Office Name': o.name,
                                'Office ID': o.id,
                                'Office Type': o.type,
                                'Name of the Sub-Division': o.subDiv,
                                'Indiapost Parcel Retail': formatRupeeStr(o.retail || 0),
                                'Indiapost Parcel Contractual': formatRupeeStr(o.contractual || 0),
                                'Speed Post Parcel': formatRupeeStr(o.speedPost || 0),
                                'No of BOs': o.noOfBOs || 0,
                                'Branch Office IPP Revenue Target (Rs.1000/- per BO)': formatRupeeStr(o.boIPP || 0),
                                'Branch Office SPP Revenue Target (Rs.1000/- per BO)': formatRupeeStr(o.boSPP || 0),
                                'Total': formatRupeeStr(o.target)
                              };
                            }
                            
                            if (selectedVertical === 'CCS') {
                              return {
                                'Sl No': o.sl,
                                'Office Name': o.name,
                                'Office ID': o.id,
                                'Type': o.type,
                                'Name of the Sub-Division': o.subDiv,
                                'Aadhaar: Annual Txn Target FY 27': o.aadhaarTxn || 0,
                                'Aadhaar: Proposed Revenue @ 61.5 (₹)': formatRupeeStr(o.aadhaarRev || 0),
                                'POPSK: Annual Txn Target FY 27': o.popskTxn || 0,
                                'POPSK: Revenue Target (388/-) (₹)': formatRupeeStr(o.popskRev || 0),
                                'Retail Post: Amount (₹)': formatRupeeStr(o.retail || 0),
                                'Total Target (₹)': formatRupeeStr(o.target)
                              };
                            }
                            
                            return {
                              ...basic,
                              'Annual Target (₹)': formatRupeeStr(o.target)
                            };
                          });
                        const ws = XLSX.utils.json_to_sheet(data);
                        const wb = XLSX.utils.book_new();
                        const label = selectedVertical === 'Parcel' ? 'Parcels' : selectedVertical === 'MailOps' ? 'Mails' : selectedVertical;
                        XLSX.utils.book_append_sheet(wb, ws, `${label} Details`);
                        XLSX.writeFile(wb, `${label}-Office-Wise-Targets.xlsx`);
                      }}
                      className="px-4 py-2 bg-emerald-700 text-white font-bold rounded-lg text-xs flex items-center gap-2"
                    >
                      <FileSpreadsheet size={16} /> Export Detailed Sheet
                    </button>
                    <button 
                      onClick={() => setSelectedVertical(null)}
                      className="px-4 py-2 bg-slate-200 text-slate-700 font-bold rounded-lg text-xs"
                    >
                      Back to Verticals
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-300 shadow-sm relative max-h-[600px]">
                  <table className="w-full border-collapse">
                    <thead className="sticky top-0 z-10 shadow-md">
                      {selectedVertical === 'CCS' ? (
                        <>
                          <tr className="bg-amber-900 text-white text-[9px] uppercase tracking-tighter">
                            <th rowSpan={2} className="p-2 border-r border-amber-800 w-12">Sl No</th>
                            <th rowSpan={2} className="p-2 border-r border-amber-800 text-left sticky left-0 bg-amber-900 z-20 min-w-[180px]">Office Name</th>
                            <th rowSpan={2} className="p-2 border-r border-amber-800">Office ID</th>
                            <th rowSpan={2} className="p-2 border-r border-amber-800">Type</th>
                            <th rowSpan={2} className="p-2 border-r border-amber-800">Name of the Sub-Division</th>
                            <th colSpan={2} className="p-2 border-b border-amber-800 text-center bg-amber-800">Aadhaar Revenue Target (₹)</th>
                            <th colSpan={2} className="p-2 border-b border-amber-800 text-center bg-amber-800">POPSK Revenue Target (₹)</th>
                            <th className="p-2 border-b border-amber-800 text-center bg-amber-800">Retail Post (₹)</th>
                            <th rowSpan={2} className="p-2 text-right">Total Target (₹)</th>
                          </tr>
                          <tr className="bg-amber-800 text-white text-[8px] font-bold leading-tight">
                            <th className="p-1.5 border-r border-amber-700 text-center">Annual Txn Target FY 27</th>
                            <th className="p-1.5 border-r border-amber-700 text-center">Revenue @ 61.5</th>
                            <th className="p-1.5 border-r border-amber-700 text-center">Annual Txn Target FY 27</th>
                            <th className="p-1.5 border-r border-amber-700 text-center">Revenue (388/-)</th>
                            <th className="p-1.5 border-r border-amber-700 text-center">Amount</th>
                          </tr>
                        </>
                      ) : selectedVertical === 'Parcel' ? (
                        <>
                          <tr className="bg-blue-900 text-white text-[9px] uppercase tracking-tighter">
                            <th rowSpan={2} className="p-2 border-r border-blue-800 w-12">Sl No</th>
                            <th rowSpan={2} className="p-2 border-r border-blue-800 text-left sticky left-0 bg-blue-900 z-20 min-w-[180px]">Office Name</th>
                            <th rowSpan={2} className="p-2 border-r border-blue-800">Office ID</th>
                            <th rowSpan={2} className="p-2 border-r border-blue-800">Type</th>
                            <th rowSpan={2} className="p-2 border-r border-blue-800">Name of the Sub-Division</th>
                            <th className="p-2 border-b border-blue-800 text-center bg-blue-800">Retail</th>
                            <th className="p-2 border-b border-blue-800 text-center bg-blue-800">Contractual</th>
                            <th className="p-2 border-b border-blue-800 text-center bg-blue-800">Speed Post</th>
                            <th rowSpan={2} className="p-2 border-r border-blue-800 text-center bg-blue-800 px-2 min-w-[50px]">No of BOs</th>
                            <th colSpan={2} className="p-2 border-b border-blue-800 text-center bg-blue-800">Branch Office Revenue Target (₹)</th>
                            <th rowSpan={2} className="p-2 text-right">Total (₹)</th>
                          </tr>
                          <tr className="bg-blue-800 text-white text-[8px] font-bold leading-tight">
                            <th className="p-1.5 border-r border-blue-700 text-center min-w-[80px]">Indiapost Retail</th>
                            <th className="p-1.5 border-r border-blue-700 text-center min-w-[100px]">Indiapost Contractual</th>
                            <th className="p-1.5 border-r border-blue-700 text-center min-w-[80px]">Speed Post Parcel</th>
                            <th className="p-1.5 border-r border-blue-700 text-center">IPP Target</th>
                            <th className="p-1.5 border-r border-blue-700 text-center">SPP Target</th>
                          </tr>
                        </>
                      ) : (
                        <tr className={`${selectedVertical === 'MailOps' ? 'bg-rose-900' : selectedVertical === 'IRGB' ? 'bg-teal-900' : 'bg-slate-900'} text-white`}>
                          <th className="p-4 text-center font-bold uppercase text-[10px] w-16">Sl No</th>
                          <th className="p-4 text-left font-bold uppercase tracking-wider sticky left-0 bg-inherit shadow-sm text-xs">Name of Office</th>
                          <th className="p-4 text-center font-bold uppercase text-[10px]">Office ID</th>
                          <th className="p-4 text-center font-bold uppercase text-[10px]">Office Type</th>
                          <th className="p-4 text-center font-bold uppercase text-xs">Sub-Division</th>
                          <th className="p-4 text-right font-bold uppercase text-xs">Annual Target (Rupees)</th>
                        </tr>
                      )}
                    </thead>
                    <tbody className="text-[11px] bg-white">
                      {officeWiseData[selectedVertical as keyof typeof officeWiseData]
                        .filter(o => {
                          if (!subDivSearch) return true;
                          return (o.subDiv || "").toLowerCase().includes(subDivSearch.toLowerCase());
                        })
                        .sort((a, b) => {
                          const slA = Number(a.sl) || 9999;
                          const slB = Number(b.sl) || 9999;
                          return slA - slB;
                        })
                        .map((office, idx) => (
                          <tr key={`${office.subDiv}-${office.name}-${idx}`} className={idx % 2 === 0 ? "bg-white border-b border-slate-100" : "bg-slate-50 border-b border-slate-100 hover:bg-amber-50/50 transition-colors"}>
                            <td className={`${(selectedVertical === 'CCS' || selectedVertical === 'Parcel') ? 'p-2' : 'p-4'} text-center border-r border-slate-100 text-slate-400 font-mono`}>{office.sl}</td>
                            <td className={`${(selectedVertical === 'CCS' || selectedVertical === 'Parcel') ? 'p-2' : 'p-4'} font-black border-r border-slate-100 uppercase sticky left-0 bg-inherit shadow-sm min-w-[180px] sm:min-w-[250px]`}>{office.name}</td>
                            <td className={`${(selectedVertical === 'CCS' || selectedVertical === 'Parcel') ? 'p-2' : 'p-4'} text-center border-r border-slate-100 font-mono text-slate-500`}>{office.id}</td>
                            <td className={`${(selectedVertical === 'CCS' || selectedVertical === 'Parcel') ? 'p-2' : 'p-4'} text-center border-r border-slate-100 italic text-slate-500 uppercase`}>{office.type}</td>
                            <td className={`${(selectedVertical === 'CCS' || selectedVertical === 'Parcel') ? 'p-2' : 'p-4'} text-center border-r border-slate-100 text-slate-600 font-bold tracking-tight`}>{office.subDiv}</td>
                             {selectedVertical === 'CCS' ? (
                              <>
                                <td className="p-2 text-center border-r border-amber-50 font-mono text-slate-500">{office.aadhaarTxn || 0}</td>
                                <td className="p-2 text-right border-r border-amber-50 font-mono text-slate-600 bg-amber-50/20">₹{formatRupeeStr(office.aadhaarRev || 0)}</td>
                                <td className="p-2 text-center border-r border-amber-50 font-mono text-slate-500">{office.popskTxn || 0}</td>
                                <td className="p-2 text-right border-r border-amber-50 font-mono text-slate-600 bg-amber-50/20">₹{formatRupeeStr(office.popskRev || 0)}</td>
                                <td className="p-2 text-right border-r border-amber-50 font-mono text-slate-600">₹{formatRupeeStr(office.retail || 0)}</td>
                                <td className="p-2 text-right font-mono font-black text-amber-900 bg-amber-100/50">₹{formatRupeeStr(office.target)}</td>
                              </>
                            ) : selectedVertical === 'Parcel' ? (
                              <>
                                <td className="p-2 text-right border-r border-blue-50 font-mono text-slate-600">₹{formatRupeeStr(office.retail || 0)}</td>
                                <td className="p-2 text-right border-r border-blue-50 font-mono text-slate-600">₹{formatRupeeStr(office.contractual || 0)}</td>
                                <td className="p-2 text-right border-r border-blue-50 font-mono text-slate-600">₹{formatRupeeStr(office.speedPost || 0)}</td>
                                <td className="p-2 text-center border-r border-blue-50 font-mono text-slate-500">{office.noOfBOs || 0}</td>
                                <td className="p-2 text-right border-r border-blue-50 font-mono text-slate-600 bg-blue-50/20">₹{formatRupeeStr(office.boIPP || 0)}</td>
                                <td className="p-2 text-right border-r border-blue-50 font-mono text-slate-600 bg-blue-50/20">₹{formatRupeeStr(office.boSPP || 0)}</td>
                                <td className="p-2 text-right font-mono font-black text-blue-900 bg-blue-100/50">₹{formatRupeeStr(office.target)}</td>
                              </>
                            ) : (
                              <td className={`p-4 text-right font-mono font-black ${selectedVertical === 'MailOps' ? 'text-rose-900 bg-rose-50/50' : selectedVertical === 'IRGB' ? 'text-teal-900 bg-teal-50/50' : 'text-slate-900 bg-slate-50/50'}`}>₹{formatRupeeStr(office.target)}</td>
                            )}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="mb-6 md:mb-10 border-b-4 border-red-600 pb-6 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
              <div className="flex-1">
                <h2 className="text-2xl md:text-4xl font-black text-red-600 uppercase tracking-tight leading-tight mb-1">Monthly Targets</h2>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <p className="text-lg md:text-2xl text-slate-900 font-bold uppercase tracking-wide">
                    Level: {monthlyLevel === 'division' ? 'Entire Division' : `Sub-Division: ${currentSubDiv}`}
                  </p>
                  <div className="flex bg-slate-100 p-1 rounded-lg print:hidden self-start">
                    <button 
                      onClick={() => setMonthlyLevel('division')}
                      className={`px-3 py-1 rounded text-[10px] font-black uppercase ${monthlyLevel === 'division' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400'}`}
                    >Division</button>
                    <button 
                      onClick={() => setMonthlyLevel('subdiv')}
                      className={`px-3 py-1 rounded text-[10px] font-black uppercase ${monthlyLevel === 'subdiv' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400'}`}
                    >Sub-Div</button>
                  </div>
                </div>
              </div>
              <div className="text-right">
                 <div className="bg-red-600 text-white px-4 py-1.5 rounded-md text-xs font-black uppercase mb-1">Fiscal Year 2026-27</div>
                 <div className="text-emerald-600 font-black text-sm uppercase tracking-widest">₹ In {monthlyLevel === 'division' ? 'Crores' : 'Lakhs'}</div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-300 mb-8">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-red-600 text-white">
                    <th className="p-4 text-left font-bold uppercase tracking-wider">Month</th>
                    <th className="p-4 text-center font-bold uppercase">Parcel</th>
                    <th className="p-4 text-center font-bold uppercase">Mail Ops</th>
                    <th className="p-4 text-center font-bold uppercase">IR & GB</th>
                    <th className="p-4 text-center font-bold uppercase">CCS</th>
                    {monthlyLevel === 'division' && (
                      <>
                        <th className="p-4 text-center font-bold uppercase">POSB</th>
                        <th className="p-4 text-center font-bold uppercase">PLI/RPLI</th>
                      </>
                    )}
                    <th className="p-4 text-center font-bold uppercase bg-red-700">Total</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {monthlyData.rows.map((row, idx) => {
                    const divisor = monthlyLevel === 'division' ? 100 : 1;
                    const precision = monthlyLevel === 'division' ? 4 : 3;
                    return (
                      <tr key={row.month} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                        <td className="p-4 font-bold text-slate-700 border-r border-slate-200 uppercase">{row.month}</td>
                        <td className="p-4 text-center border-r border-slate-200 font-mono italic">{formatVal(row.Parcel/divisor, precision)}</td>
                        <td className="p-4 text-center border-r border-slate-200 font-mono italic">{formatVal(row.MailOps/divisor, precision)}</td>
                        <td className="p-4 text-center border-r border-slate-200 font-mono italic">{formatVal(row.IRGB/divisor, precision)}</td>
                        <td className="p-4 text-center border-r border-slate-200 font-mono italic">{formatVal(row.CCS/divisor, precision)}</td>
                        {monthlyLevel === 'division' && (
                          <>
                            <td className="p-4 text-center border-r border-slate-200 font-mono font-bold text-red-600">{formatVal(row.POSB/100, 3)}</td>
                            <td className="p-4 text-center border-r border-slate-200 font-mono font-bold text-emerald-700">{formatVal(row.PLI/100, 3)}</td>
                          </>
                        )}
                        <td className="p-4 text-center font-black bg-slate-100 text-slate-900 font-mono">{formatVal(row.total/divisor, precision)}</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-amber-50 font-black text-red-700 border-t-2 border-red-200">
                    <td className="p-4 text-center uppercase tracking-widest">Total Year</td>
                    <td className="p-4 text-center font-mono">{formatVal(monthlyData.grand.Parcel / (monthlyLevel === 'division' ? 100 : 1), (monthlyLevel === 'division' ? 4 : 3))}</td>
                    <td className="p-4 text-center font-mono">{formatVal(monthlyData.grand.MailOps / (monthlyLevel === 'division' ? 100 : 1), (monthlyLevel === 'division' ? 4 : 3))}</td>
                    <td className="p-4 text-center font-mono">{formatVal(monthlyData.grand.IRGB / (monthlyLevel === 'division' ? 100 : 1), (monthlyLevel === 'division' ? 4 : 3))}</td>
                    <td className="p-4 text-center font-mono">{formatVal(monthlyData.grand.CCS / (monthlyLevel === 'division' ? 100 : 1), (monthlyLevel === 'division' ? 4 : 3))}</td>
                    {monthlyLevel === 'division' && (
                      <>
                        <td className="p-4 text-center font-mono">{formatVal(monthlyData.grand.POSB/100, 3)}</td>
                        <td className="p-4 text-center font-mono">{formatVal(monthlyData.grand.PLI/100, 3)}</td>
                      </>
                    )}
                    <td className="p-4 text-center text-xl font-black font-mono">{formatVal(monthlyData.grand.total / (monthlyLevel === 'division' ? 100 : 1), (monthlyLevel === 'division' ? 4 : 3))}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex gap-4 p-4 bg-amber-50 rounded-lg border border-amber-200 text-[10px] text-amber-800 font-bold uppercase leading-relaxed">
              <Info size={16} className="shrink-0" />
              <div>
                <p>Note: Monthly distribution for Parcel, Mail Ops, IR&GB, and CCS follows the seasonal trend weights derived from the Division Target Slide.</p>
                <p className="mt-1">POSB and PLI targets are shown as flat monthly averages for the Entire Division view (Values in Crores).</p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-20 flex flex-col sm:flex-row justify-between items-center text-[9px] text-slate-400 border-t border-slate-100 pt-4 font-bold tracking-widest uppercase gap-2">
           <span>Internal Revenue Monitoring System v2.1</span>
           <span>Dashboard Generated: {new Date().toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}

function DivStat({ label, value, color }: { label: string, value: string, color: string }) {
  const colors: any = {
    red: "text-red-600 bg-red-50 border-red-100",
    amber: "text-amber-600 bg-amber-50 border-amber-100",
    emerald: "text-emerald-600 bg-emerald-50 border-emerald-100",
    orange: "text-orange-600 bg-orange-50 border-orange-100"
  };
  return (
    <div className={`p-4 rounded-xl border ${colors[color] || colors.red}`}>
      <p className="text-[9px] font-black uppercase tracking-widest mb-1 opacity-70">{label}</p>
      <p className="text-lg font-black uppercase tracking-tight">{value}</p>
    </div>
  );
}
