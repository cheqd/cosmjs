export function getExportFilename(startDate?: string, endDate?: string): string {
  let dateRange: string;
  
  if (startDate && endDate) {
    dateRange = `${startDate}-to-${endDate}`;
  } else if (startDate) {
    dateRange = `from-${startDate}`;
  } else if (endDate) {
    dateRange = `until-${endDate}`;
  } else {
    dateRange = 'last-30-days';
  }
  
  return `faucet-requests-${dateRange}.csv`;
} 
