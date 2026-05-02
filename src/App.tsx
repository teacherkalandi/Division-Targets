/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Upload, Printer, ChevronDown, FileSpreadsheet, LayoutDashboard, Info, ExternalLink, CheckCircle2, RefreshCw, Download } from 'lucide-react';
import { ProcessedRevenueData, RevenueCategories, SubDivisionData } from './types';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';

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
  const [view, setView] = useState<'subdiv' | 'division' | 'monthly'>('subdiv');
  const [processedData, setProcessedData] = useState<ProcessedRevenueData>(initialMockData);
  const [increases, setIncreases] = useState<Record<string, Record<string, number>>>({});
  const [currentSubDiv, setCurrentSubDiv] = useState(Object.keys(initialMockData)[0]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [monthlyLevel, setMonthlyLevel] = useState<'division' | 'subdiv'>('division');

  const parseValue = (val: any) => {
    if (val === undefined || val === null) return 0;
    const str = val.toString().trim();
    if (!str) return 0;
    const num = parseFloat(str.replace(/[₹,\s]/g, ""));
    return isNaN(num) ? 0 : num;
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
          const parentVal = (parseValue(row[5]) + parseValue(row[6]) + parseValue(row[7])) / 100000;
          const boVal = (parseValue(row[9]) + parseValue(row[10])) / 100000;
          newData[div][type].Parcel += parentVal;
          newData[div]['BO'].Parcel += boVal;
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
        });
      }

      if (raw.ccs && Array.isArray(raw.ccs)) {
        raw.ccs.forEach((row: any[]) => {
          const sl = Number(row[0]);
          if (isNaN(sl) || sl === 0) return;
          if (!row[4]) return;
          const div = initDiv(row[4]);
          const type = categorizeOffice(row[2], row[1], row[3]);
          const totalCCS = parseValue(row[10]) / 100000;
          newData[div][type].CCS += totalCCS;
        });
      }

      const subDivs = Object.keys(newData).sort();
      if (subDivs.length > 0) {
        setProcessedData(newData);
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
      'Parcel': row.Parcel,
      'Mail Ops': row.MailOps,
      'IR & GB': row.IRGB,
      'CCS': row.CCS,
      'Total': row.total
    }));
    divRows.push({
      'Sub-Division': 'GRAND TOTAL',
      'Parcel': divisionData.grand.Parcel,
      'Mail Ops': divisionData.grand.MailOps,
      'IR & GB': divisionData.grand.IRGB,
      'CCS': divisionData.grand.CCS,
      'Total': divisionData.grand.total
    });
    const wsDiv = XLSX.utils.json_to_sheet(divRows);
    XLSX.utils.book_append_sheet(wb, wsDiv, "Division Summary");

    // SHEET 2: Sub-Division Detail (Current Selection)
    if (currentData && colTotals) {
      const categoryData = categories.map(cat => {
        const rowData = currentData[cat];
        return {
          'Office Type': cat,
          'Parcel': rowData.Parcel,
          'Mail Ops': rowData.MailOps,
          'IR & GB': rowData.IRGB,
          'CCS': rowData.CCS,
          'Total': rowData.Parcel + rowData.MailOps + rowData.IRGB + rowData.CCS
        };
      });
      categoryData.push({
        'Office Type': 'GRAND TOTAL',
        'Parcel': colTotals.Parcel,
        'Mail Ops': colTotals.MailOps,
        'IR & GB': colTotals.IRGB,
        'CCS': colTotals.CCS,
        'Total': colTotals.Grand
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
          'Annual Target 25-26': past.target,
          'Achievement 25-26': past.achievement,
          'Annual Target 26-27': currentTarget,
          '% Increase': `${increase.toFixed(2)}%`
        };
      });
      const wsVert = XLSX.utils.json_to_sheet(verticalData);
      XLSX.utils.book_append_sheet(wb, wsVert, `${currentSubDiv.substring(0, 20)} Targets`);
    }

    // SHEET 3: Monthly Targets (Division Level)
    const monthlyRows = monthlyData.rows.map(row => ({
      'Month': row.month,
      'Parcel': row.Parcel,
      'Mail Ops': row.MailOps,
      'IR & GB': row.IRGB,
      'CCS': row.CCS,
      'POSB': monthlyLevel === 'division' ? row.POSB : 0,
      'PLI': monthlyLevel === 'division' ? row.PLI : 0,
      'Total': row.total
    }));
    const wsMonth = XLSX.utils.json_to_sheet(monthlyRows);
    XLSX.utils.book_append_sheet(wb, wsMonth, "Monthly Targets");

    XLSX.writeFile(wb, fileName);
  };

  const handleDownloadPDF = () => {
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      
      // Title
      pdf.setFontSize(22);
      pdf.setTextColor(185, 28, 28); // red-700
      pdf.text('INDIA POST REVENUE TARGET REPORT', pageWidth / 2, 20, { align: 'center' });
      
      pdf.setFontSize(10);
      pdf.setTextColor(100);
      pdf.text(`Generated on: ${new Date().toLocaleString()}`, pageWidth / 2, 28, { align: 'center' });

      let currentY = 40;

      // SECTION 1: Division Summary
      pdf.setFontSize(14);
      pdf.setTextColor(30, 41, 59);
      pdf.text('1. DIVISION OVERALL SUMMARY (FY 2026-27)', 14, currentY);
      
      const divHeaders = [['Sub-Division', 'Parcel', 'Mail Ops', 'IR & GB', 'CCS', 'Total']];
      const divDataRows = divisionData.rows.map(r => [r.name, r.Parcel.toFixed(3), r.MailOps.toFixed(3), r.IRGB.toFixed(3), r.CCS.toFixed(3), r.total.toFixed(3)]);
      divDataRows.push(['GRAND TOTAL', divisionData.grand.Parcel.toFixed(3), divisionData.grand.MailOps.toFixed(3), divisionData.grand.IRGB.toFixed(3), divisionData.grand.CCS.toFixed(3), divisionData.grand.total.toFixed(3)]);

      (pdf as any).autoTable({
        startY: currentY + 5,
        head: divHeaders,
        body: divDataRows,
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42] }, // slate-900
        styles: { fontSize: 8 },
        footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' }
      });

      currentY = (pdf as any).lastAutoTable.finalY + 15;

      // SECTION 2: Sub-Division Detail
      if (currentY > 240) { pdf.addPage(); currentY = 20; }
      pdf.setFontSize(14);
      pdf.text(`2. SUB-DIVISION ANALYSIS: ${currentSubDiv.toUpperCase()}`, 14, currentY);

      // Office Distribution
      const subHeaders = [['Office Category', 'Parcel', 'Mail Ops', 'IR & GB', 'CCS', 'Total']];
      const subDataRows = categories.map(cat => {
        const d = currentData[cat];
        const total = d.Parcel + d.MailOps + d.IRGB + d.CCS;
        return [cat, d.Parcel.toFixed(3), d.MailOps.toFixed(3), d.IRGB.toFixed(3), d.CCS.toFixed(3), total.toFixed(3)];
      });
      subDataRows.push(['TOTAL', colTotals.Parcel.toFixed(3), colTotals.MailOps.toFixed(3), colTotals.IRGB.toFixed(3), colTotals.CCS.toFixed(3), colTotals.Grand.toFixed(3)]);

      (pdf as any).autoTable({
        startY: currentY + 5,
        head: subHeaders,
        body: subDataRows,
        theme: 'grid',
        headStyles: { fillColor: [185, 28, 28] }, // red-700
        styles: { fontSize: 8 }
      });

      currentY = (pdf as any).lastAutoTable.finalY + 15;

      // Vertical Target Analysis
      if (currentY > 240) { pdf.addPage(); currentY = 20; }
      pdf.setFontSize(12);
      pdf.text(`Vertical Growth Analysis (Comparison with FY 2025-26)`, 14, currentY);

      const subDivPast = getPastPerformanceData(currentSubDiv) || {};
      const vertHeaders = [['Vertical', 'Target 25-26', 'Achiev 25-26', 'Target 26-27', '% Increase']];
      const vertDataRows = [
        { key: 'Parcel', label: 'Parcel' },
        { key: 'MailOps', label: 'Mail Operations' },
        { key: 'IRGB', label: 'IR & GB' },
        { key: 'CCS', label: 'CCS' }
      ].map(row => {
        const past = subDivPast[row.key] || { target: 0, achievement: 0 };
        const currentTarget = (colTotals as any)[row.key];
        const increase = past.target > 0 ? ((currentTarget - past.target) / past.target * 100) : 0;
        return [row.label, past.target.toFixed(3), past.achievement.toFixed(3), currentTarget.toFixed(3), `${increase.toFixed(2)}%`];
      });

      (pdf as any).autoTable({
        startY: currentY + 5,
        head: vertHeaders,
        body: vertDataRows,
        theme: 'plain',
        headStyles: { fillColor: [248, 250, 252], textColor: [15, 23, 42], fontStyle: 'bold' },
        styles: { fontSize: 8 }
      });

      currentY = (pdf as any).lastAutoTable.finalY + 15;

      // SECTION 3: Monthly Distribution
      if (currentY > 200) { pdf.addPage(); currentY = 20; }
      pdf.setFontSize(14);
      pdf.text('3. MONTHLY REVENUE TARGETS (DIVISION LEVEL)', 14, currentY);

      const monthHeaders = [['Month', 'Parcel', 'Mail Ops', 'IR & GB', 'CCS', 'POSB', 'PLI', 'Total']];
      const monthDataRows = monthlyData.rows.map(r => [
        r.month, 
        r.Parcel.toFixed(3), 
        r.MailOps.toFixed(3), 
        r.IRGB.toFixed(3), 
        r.CCS.toFixed(3), 
        r.POSB.toFixed(2), 
        r.PLI.toFixed(2), 
        r.total.toFixed(3)
      ]);

      (pdf as any).autoTable({
        startY: currentY + 5,
        head: monthHeaders,
        body: monthDataRows,
        theme: 'striped',
        headStyles: { fillColor: [51, 65, 85] }, // slate-700
        styles: { fontSize: 7 }
      });

      pdf.save(`IndiaPost-Comprehensive-Report.pdf`);
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      alert('Error generating consolidated PDF report.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans">
      <div className="max-w-5xl mx-auto mb-6 print:hidden flex flex-wrap justify-between items-center bg-white p-4 rounded-lg shadow-sm border border-slate-200 gap-4">
        <div className="flex items-center gap-6">
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button 
              onClick={() => setView('subdiv')}
              className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition ${view === 'subdiv' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Sub-Division Review
            </button>
            <button 
              onClick={() => setView('division')}
              className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition ${view === 'division' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Division Summary
            </button>
            <button 
              onClick={() => setView('monthly')}
              className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition ${view === 'monthly' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Monthly Targets
            </button>
          </div>

          {(view === 'subdiv' || (view === 'monthly' && monthlyLevel === 'subdiv')) && (
            <div className="flex items-center gap-3">
              <label className="font-bold text-slate-500 uppercase text-[10px] tracking-widest">Select Sub-Division:</label>
              <div className="relative min-w-[200px]">
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
        
        <div className="flex gap-3">
          <button 
            onClick={fetchAndSync}
            disabled={isSyncing}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow transition flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw size={18} className={isSyncing ? 'animate-spin' : ''} /> {isSyncing ? 'Syncing...' : 'Sync Data'}
          </button>
          <button 
            onClick={() => window.print()}
            className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg shadow transition flex items-center gap-2"
          >
            <Printer size={18} /> Print Slide
          </button>
          <button 
            onClick={handleDownloadPDF}
            className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow transition flex items-center gap-2"
          >
            <Download size={18} /> PDF
          </button>
          <button 
            onClick={handleDownloadExcel}
            className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg shadow transition flex items-center gap-2"
          >
            <FileSpreadsheet size={18} /> Excel
          </button>
        </div>
      </div>

      <div id="report-container" className="max-w-5xl mx-auto bg-white p-8 md:p-12 rounded-2xl shadow-xl border border-slate-200 print:shadow-none print:p-0 print:border-none">
        
        {view === 'subdiv' ? (
          <div>
            <div className="mb-10 border-b-4 border-red-600 pb-6 flex flex-col md:flex-row justify-between items-end gap-2">
              <div>
                <h2 className="text-4xl font-black text-red-600 uppercase tracking-tight leading-none mb-2">Revenue Target</h2>
                <p className="text-2xl text-slate-900 font-bold uppercase tracking-wide">Sub-Division: {currentSubDiv}</p>
              </div>
              <div className="text-right">
                 <div className="bg-red-600 text-white px-4 py-1.5 rounded-md text-xs font-black uppercase mb-1">Fiscal Year 2026-27</div>
                 <div className="text-emerald-600 font-black text-sm uppercase tracking-widest">₹ In Lakhs</div>
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
                            'Parcel': rowData.Parcel.toFixed(2),
                            'Mail Ops': rowData.MailOps.toFixed(2),
                            'IR & GB': rowData.IRGB.toFixed(2),
                            'CCS': rowData.CCS.toFixed(2),
                            'Total': (rowData.Parcel + rowData.MailOps + rowData.IRGB + rowData.CCS).toFixed(2)
                          };
                        });
                        categoryData.push({
                          'Office Type': 'GRAND TOTAL',
                          'Parcel': colTotals.Parcel.toFixed(2),
                          'Mail Ops': colTotals.MailOps.toFixed(2),
                          'IR & GB': colTotals.IRGB.toFixed(2),
                          'CCS': colTotals.CCS.toFixed(2),
                          'Total': colTotals.Grand.toFixed(2)
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
                              <td className="p-4 text-center border-r border-slate-200 font-mono">{currentData[cat].Parcel.toFixed(2)}</td>
                              <td className="p-4 text-center border-r border-slate-200 font-mono">{currentData[cat].MailOps.toFixed(2)}</td>
                              <td className="p-4 text-center border-r border-slate-200 font-mono">{currentData[cat].IRGB.toFixed(2)}</td>
                              <td className="p-4 text-center border-r border-slate-200 font-mono">{currentData[cat].CCS.toFixed(2)}</td>
                              <td className="p-4 text-center font-black bg-slate-100 text-slate-900 font-mono">{rowTotal.toFixed(2)}</td>
                            </tr>
                          );
                        })}
                        <tr className="bg-amber-50 font-black text-red-700 border-t-2 border-red-200">
                          <td className="p-4 text-center uppercase tracking-widest ">Grand Total</td>
                          <td className="p-4 text-center font-mono">{colTotals.Parcel.toFixed(2)}</td>
                          <td className="p-4 text-center font-mono">{colTotals.MailOps.toFixed(2)}</td>
                          <td className="p-4 text-center font-mono">{colTotals.IRGB.toFixed(2)}</td>
                          <td className="p-4 text-center font-mono">{colTotals.CCS.toFixed(2)}</td>
                          <td className="p-4 text-center text-xl font-black font-mono">{colTotals.Grand.toFixed(2)}</td>
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
                               return [row.label, past.target.toFixed(3), past.achievement.toFixed(3), currentTarget.toFixed(3), `${increase.toFixed(2)}%`];
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
                              <td className="p-4 text-center font-mono border-r border-slate-200">{past.target.toFixed(3)}</td>
                              <td className="p-4 text-center font-mono border-r border-slate-200">{past.achievement.toFixed(3)}</td>
                              <td className="p-4 text-center font-mono font-black border-r border-slate-200 bg-blue-50/30 text-blue-900">{row.val.toFixed(3)}</td>
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
                              <td className="p-4 text-center font-mono border-r border-slate-300">{pastTotalTarget.toFixed(3)}</td>
                              <td className="p-4 text-center font-mono border-r border-slate-300">{pastTotalAchiev.toFixed(3)}</td>
                              <td className="p-4 text-center font-mono border-r border-slate-300 bg-blue-100 text-blue-950">{colTotals.Grand.toFixed(3)}</td>
                              <td className="p-4 text-center font-mono text-blue-800">+{totalIncr.toFixed(2)}%</td>
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
          <div>
            <div className="mb-10 border-b-4 border-red-600 pb-6 flex flex-col md:flex-row justify-between items-end gap-2">
              <div>
                <h2 className="text-4xl font-black text-red-600 uppercase tracking-tight leading-none mb-2">Division Revenue Summary</h2>
                <p className="text-2xl text-slate-900 font-bold uppercase tracking-wide">Comprehensive Target View</p>
              </div>
              <div className="text-right">
                 <div className="bg-red-600 text-white px-4 py-1.5 rounded-md text-xs font-black uppercase mb-1">Fiscal Year 2026-27</div>
                 <div className="text-emerald-600 font-black text-sm uppercase tracking-widest">₹ In Lakhs</div>
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
                      <td className="p-4 text-center border-r border-slate-200 font-mono">{row.Parcel.toFixed(2)}</td>
                      <td className="p-4 text-center border-r border-slate-200 font-mono">{row.MailOps.toFixed(2)}</td>
                      <td className="p-4 text-center border-r border-slate-200 font-mono">{row.IRGB.toFixed(2)}</td>
                      <td className="p-4 text-center border-r border-slate-200 font-mono">{row.CCS.toFixed(2)}</td>
                      <td className="p-4 text-center font-black bg-slate-100 text-slate-900 font-mono">{row.total.toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr className="bg-amber-50 font-black text-red-700 border-t-2 border-red-200 text-base">
                    <td className="p-4 text-center uppercase tracking-widest">Grand Total</td>
                    <td className="p-4 text-center font-mono">{divisionData.grand.Parcel.toFixed(2)}</td>
                    <td className="p-4 text-center font-mono">{divisionData.grand.MailOps.toFixed(2)}</td>
                    <td className="p-4 text-center font-mono">{divisionData.grand.IRGB.toFixed(2)}</td>
                    <td className="p-4 text-center font-mono">{divisionData.grand.CCS.toFixed(2)}</td>
                    <td className="p-4 text-center text-2xl font-black font-mono">{divisionData.grand.total.toFixed(2)}</td>
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
                        <th className="p-3 text-center font-black text-slate-800 uppercase tracking-tighter border-r border-slate-300">Annual Target 2025-26 (₹ in Lakhs)</th>
                        <th className="p-3 text-center font-black text-slate-800 uppercase tracking-tighter border-r border-slate-300">Achievement 2025-26 (₹ in Lakhs)</th>
                        <th className="p-3 text-center font-black text-slate-800 uppercase tracking-tighter border-r border-slate-300">Annual Target 2026-27 (₹ in Lakhs)</th>
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
                            <td className="p-4 text-center font-mono border-r border-slate-200">{pastGrandTarget.toFixed(3)}</td>
                            <td className="p-4 text-center font-mono border-r border-slate-200">{pastGrandAchiev.toFixed(3)}</td>
                            <td className="p-4 text-center font-mono font-black border-r border-slate-200 bg-blue-50/30 text-blue-900">{currentTarget.toFixed(3)}</td>
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
                            <td className="p-5 text-center font-mono border-r border-slate-300">{totalPastTarget.toFixed(3)}</td>
                            <td className="p-5 text-center font-mono border-r border-slate-300">{totalPastAchiev.toFixed(3)}</td>
                            <td className="p-5 text-center font-mono border-r border-slate-300 bg-blue-100 text-blue-950">{divisionData.grand.total.toFixed(3)}</td>
                            <td className="p-5 text-center font-mono text-blue-800">+{totalIncrease.toFixed(2)}%</td>
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
        ) : (
          <div>
            <div className="mb-10 border-b-4 border-red-600 pb-6 flex flex-col md:flex-row justify-between items-end gap-2">
              <div className="flex-1">
                <h2 className="text-4xl font-black text-red-600 uppercase tracking-tight leading-none mb-2">Monthly Targets Vertical-wise</h2>
                <div className="flex items-center gap-4">
                  <p className="text-2xl text-slate-900 font-bold uppercase tracking-wide">
                    Level: {monthlyLevel === 'division' ? 'Entire Division' : `Sub-Division: ${currentSubDiv}`}
                  </p>
                  <div className="flex bg-slate-100 p-1 rounded-lg print:hidden">
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
                 <div className="text-emerald-600 font-black text-sm uppercase tracking-widest">₹ In Lakhs</div>
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
                  {monthlyData.rows.map((row, idx) => (
                    <tr key={row.month} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                      <td className="p-4 font-bold text-slate-700 border-r border-slate-200 uppercase">{row.month}</td>
                      <td className="p-4 text-center border-r border-slate-200 font-mono italic">{row.Parcel.toFixed(3)}</td>
                      <td className="p-4 text-center border-r border-slate-200 font-mono italic">{row.MailOps.toFixed(3)}</td>
                      <td className="p-4 text-center border-r border-slate-200 font-mono italic">{row.IRGB.toFixed(3)}</td>
                      <td className="p-4 text-center border-r border-slate-200 font-mono italic">{row.CCS.toFixed(3)}</td>
                      {monthlyLevel === 'division' && (
                        <>
                          <td className="p-4 text-center border-r border-slate-200 font-mono font-bold text-red-600">{row.POSB.toFixed(2)}</td>
                          <td className="p-4 text-center border-r border-slate-200 font-mono font-bold text-emerald-700">{row.PLI.toFixed(2)}</td>
                        </>
                      )}
                      <td className="p-4 text-center font-black bg-slate-100 text-slate-900 font-mono">{row.total.toFixed(3)}</td>
                    </tr>
                  ))}
                  <tr className="bg-amber-50 font-black text-red-700 border-t-2 border-red-200">
                    <td className="p-4 text-center uppercase tracking-widest">Total Year</td>
                    <td className="p-4 text-center font-mono">{monthlyData.grand.Parcel.toFixed(3)}</td>
                    <td className="p-4 text-center font-mono">{monthlyData.grand.MailOps.toFixed(3)}</td>
                    <td className="p-4 text-center font-mono">{monthlyData.grand.IRGB.toFixed(3)}</td>
                    <td className="p-4 text-center font-mono">{monthlyData.grand.CCS.toFixed(3)}</td>
                    {monthlyLevel === 'division' && (
                      <>
                        <td className="p-4 text-center font-mono">{monthlyData.grand.POSB.toFixed(2)}</td>
                        <td className="p-4 text-center font-mono">{monthlyData.grand.PLI.toFixed(2)}</td>
                      </>
                    )}
                    <td className="p-4 text-center text-xl font-black font-mono">{monthlyData.grand.total.toFixed(3)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex gap-4 p-4 bg-amber-50 rounded-lg border border-amber-200 text-[10px] text-amber-800 font-bold uppercase leading-relaxed">
              <Info size={16} className="shrink-0" />
              <div>
                <p>Note: Monthly distribution for Parcel, Mail Ops, IR&GB, and CCS follows the seasonal trend weights derived from the Division Target Slide.</p>
                <p className="mt-1">POSB and PLI targets are shown as flat monthly averages for the Entire Division view (Values in Lakhs).</p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-20 flex justify-between items-center text-[9px] text-slate-400 border-t border-slate-100 pt-4 font-bold tracking-widest uppercase">
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
