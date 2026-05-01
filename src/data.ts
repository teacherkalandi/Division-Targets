import { DashboardData, ParcelRecord, MailRecord, CCSRecord } from './types';

// Mock data generator helper
const generateMockData = (): DashboardData => {
  const subDivisions = ['Cuttack North', 'Cuttack South', 'Bhubaneswar'];
  const officeTypes: ('HO' | 'MDG' | 'Delivery S.O' | 'Non Delivery S.O' | 'BO')[] = ['HO', 'MDG', 'Delivery S.O', 'BO'];

  const parcelData: ParcelRecord[] = [];
  const mailData: MailRecord[] = [];
  const ccsData: CCSRecord[] = [];

  let sl = 1;
  subDivisions.forEach(sd => {
    officeTypes.forEach((type, idx) => {
      const officeId = `${sd.substring(0, 2).toUpperCase()}${idx + 100}`;
      const officeName = `${sd} ${type} ${idx + 1}`;
      
      parcelData.push({
        slNo: sl,
        officeName,
        officeId,
        typeOfOffice: type,
        subDivisionName: sd,
        parcelRetailTarget: Math.round(Math.random() * 50000),
        parcelContractualTarget: Math.round(Math.random() * 100000),
        speedPostParcelTarget: Math.round(Math.random() * 80000),
        numBOs: type === 'Delivery S.O' ? 5 : 0,
        parcelRetailTargetBOs: type === 'Delivery S.O' ? 5000 : 0,
        speedPostParcelTargetBOs: type === 'Delivery S.O' ? 5000 : 0,
        totalTarget: 150000
      });

      mailData.push({
        slNo: sl,
        officeName,
        officeId,
        typeOfOffice: type,
        subDivisionName: sd,
        speedPostDomesticTarget: Math.round(Math.random() * 40000),
        internationalMailTarget: Math.round(Math.random() * 5000),
        numBOs: type === 'Delivery S.O' ? 5 : 0,
        speedPostTargetBOs: type === 'Delivery S.O' ? 10000 : 0,
        totalSpeedPostTarget: 50000
      });

      ccsData.push({
        slNo: sl,
        officeName,
        officeId,
        typeOfOffice: type,
        subDivisionName: sd,
        annualAadhaarTransactionTarget: 1200,
        annualAadhaarRevenueTarget: Math.round(Math.random() * 60000),
        annualPOPSKTransactionTarget: 500,
        annualPOPSKRevenueTarget: Math.round(Math.random() * 25000),
        annualRetailPostRevenueTarget: Math.round(Math.random() * 15000),
        totalCCSRevenueTarget: 100000
      });

      sl++;
    });
  });

  return { subDivisions, parcelData, mailData, ccsData };
};

export const MOCK_DASHBOARD_DATA = generateMockData();
