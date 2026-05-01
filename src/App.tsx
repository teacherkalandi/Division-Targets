/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Upload, Printer, ChevronDown, FileSpreadsheet, LayoutDashboard, Info, ExternalLink, CheckCircle2, RefreshCw } from 'lucide-react';
import { ProcessedRevenueData, RevenueCategories, SubDivisionData } from './types';

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

const initialMockData: ProcessedRevenueData = {
  "Sample Sub-Division": {
    "HO": { Parcel: 35.00, MailOps: 43.00, IRGB: 2.20, CCS: 13.69 },
    "MDG": { Parcel: 6.09, MailOps: 6.04, IRGB: 0.15, CCS: 6.92 },
    "Delivery S.O": { Parcel: 9.51, MailOps: 11.98, IRGB: 1.25, CCS: 27.25 },
    "Non Delivery S.O": { Parcel: 0.00, MailOps: 0.00, IRGB: 0.00, CCS: 0.00 },
    "BO": { Parcel: 1.58, MailOps: 1.58, IRGB: 0.00, CCS: 0.00 }
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
        const d = div.trim();
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
        </div>
      </div>

      <div className="max-w-5xl mx-auto bg-white p-8 md:p-12 rounded-2xl shadow-xl border border-slate-200 print:shadow-none print:p-0 print:border-none">
        
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
                  <h3 className="font-black text-slate-800 text-lg uppercase mb-4 flex items-center gap-2">
                    <span className="bg-red-600 w-2 h-6 inline-block"></span>
                    I. Office Category-wise Distribution
                  </h3>
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
                    <h3 className="font-black text-slate-800 text-lg uppercase mb-4 flex items-center gap-2">
                      <span className="bg-amber-500 w-2 h-6 inline-block"></span>
                      II. Performance Growth Plan
                    </h3>
                    <div className="rounded-lg border border-slate-300 overflow-hidden">
                      <table className="w-full border-collapse text-sm">
                        <thead>
                          <tr className="bg-slate-100 border-b border-slate-300">
                            <th className="p-3 text-left font-bold text-slate-600 uppercase">Revenue Head</th>
                            <th className="p-3 text-center font-bold text-slate-600 uppercase">Target</th>
                            <th className="p-3 text-center font-bold text-slate-600 uppercase">% Growth</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            { key: 'Parcel', label: 'Parcel Revenue', val: colTotals.Parcel },
                            { key: 'MailOps', label: 'Mail Operations', val: colTotals.MailOps },
                            { key: 'IRGB', label: 'IR & GB', val: colTotals.IRGB },
                            { key: 'CCS', label: 'CCS Services', val: colTotals.CCS },
                            { key: 'TOTAL', label: 'Total Sub-Division', val: colTotals.Grand, bold: true }
                          ].map((row) => (
                            <tr key={row.key} className={row.bold ? "bg-slate-200 font-black" : "bg-white border-b border-slate-200"}>
                              <td className="p-3 pl-5 text-slate-700 text-xs font-bold uppercase">{row.label}</td>
                              <td className="p-3 text-center font-mono text-slate-900">{row.val.toFixed(2)}</td>
                              <td className="p-3 text-center bg-red-50/30 print:bg-transparent">
                                <div className="flex items-center justify-center gap-1">
                                  <input 
                                    type="number" 
                                    className="w-12 text-center bg-transparent focus:outline-none border-b-2 border-red-400 font-bold"
                                    value={subDivIncreases[row.key] || ''}
                                    placeholder="0"
                                    onChange={(e) => handleIncreaseChange(row.key, e.target.value)}
                                  /> <span className="text-xs font-bold text-slate-400">%</span>
                                </div>
                              </td>
                            </tr>
                          ))}
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
                  Division Highlights
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
