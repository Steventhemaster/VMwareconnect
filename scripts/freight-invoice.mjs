// Tenant Account FVC = Freight. Deadfreight, port costs and hire are separate.
export function freightInvoice(lines){
 if(!Array.isArray(lines))return {status:'unknown',invoiceCount:0,pendingLineCount:0,statusCodes:[]};
 const freight=lines.filter(l=>l.account?.accountCode==='FVC');
 if(!freight.length)return {status:'not-registered',invoiceCount:0,pendingLineCount:0,statusCodes:[]};
 const docs=new Set();let pending=0,assembled=0,reversed=0,unknown=0;
 for(const line of freight){
  const d=line.document,code=d?.invoicingStatus?.statusTypeCode||line.invoicingStatus?.statusTypeCode;
  if(d?.reversed===true||d?.documentType?.documentType==='CRO'){reversed++;continue;}
  if(d?.key!=null&&d?.documentType?.documentType==='INO'&&d.invoiced===true&&d.reversed===false&&['POS','RFP'].includes(code)){docs.add(String(d.key));continue;}
  if(d?.assembled===true){assembled++;continue;}
  if(code==='PEN'&&!d?.invoiced){pending++;continue;}
  unknown++;
 }
 const outstanding=pending+assembled+reversed+unknown;
 const status=unknown?'unknown':docs.size?(outstanding?'partial':'invoiced'):reversed?'reversed':assembled?'assembled':'not-invoiced';
 return {status,invoiceCount:docs.size,pendingLineCount:outstanding,statusCodes:[...new Set(freight.map(l=>l.document?.invoicingStatus?.statusTypeCode||l.invoicingStatus?.statusTypeCode).filter(Boolean))].sort()};
}
