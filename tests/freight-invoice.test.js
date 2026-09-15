import test from 'node:test';
import assert from 'node:assert/strict';
import {freightInvoice} from '../scripts/freight-invoice.mjs';
const pending={account:{accountCode:'FVC'},invoicingStatus:{statusTypeCode:'PEN'},document:null};
const posted={...pending,document:{key:123,invoiced:true,reversed:false,assembled:false,documentType:{documentType:'INO'},invoicingStatus:{statusTypeCode:'POS'}}};
test('freight invoices exclude other accounts and count distinct outgoing documents',()=>{
 assert.equal(freightInvoice([{...pending,account:{accountCode:'PCO'}}]).status,'not-registered');
 assert.deepEqual(freightInvoice([posted,posted]),{status:'invoiced',invoiceCount:1,pendingLineCount:0,statusCodes:['POS']});
 assert.equal(freightInvoice([posted,pending]).status,'partial');
 assert.equal(freightInvoice([pending]).status,'not-invoiced');
});
test('assembled, reversed and unknown lines never silently become invoiced',()=>{
 assert.equal(freightInvoice([{...posted,document:{...posted.document,invoiced:false,assembled:true,invoicingStatus:{statusTypeCode:'PEN'}}}]).status,'assembled');
 assert.equal(freightInvoice([{...posted,document:{...posted.document,reversed:true}}]).status,'reversed');
 assert.equal(freightInvoice([{...posted,document:{...posted.document,documentType:{documentType:'CRO'}}}]).status,'reversed');
 assert.equal(freightInvoice([{account:{accountCode:'FVC'}}]).status,'unknown');
 assert.equal(freightInvoice(null).status,'unknown');
 assert.equal(freightInvoice([{...posted,document:{...posted.document,invoicingStatus:{statusTypeCode:'RFP'}}}]).status,'invoiced');
});
