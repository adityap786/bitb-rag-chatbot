import React, { useState } from 'react';
import { financialTenantConfig } from '@/app/tenant/financial';

interface FinancialWidgetExtensionsProps {
  onSendMessage: (message: string) => void;
  tenantId: string;
}

export function FinancialWidgetExtensions({ onSendMessage, tenantId }: FinancialWidgetExtensionsProps) {
  const [transactionStatus, setTransactionStatus] = useState<string | null>(null);

  const handleCheckTransaction = async () => {
    const amountStr = prompt('Enter transaction amount:');
    const amount = Number(amountStr);
    if (!amount || isNaN(amount)) return;
    setTransactionStatus('Checking...');
    try {
      const response = await fetch('/api/financial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          action: 'check_transaction',
          payload: { amount }
        })
      });
      const data = await response.json();
      setTransactionStatus(data.transactionStatus);
    } catch (error) {
      setTransactionStatus('Error checking transaction.');
    }
  };

  return (
    <div className="p-4 border-t border-gray-200 bg-green-50">
      <div className="text-xs text-gray-700 mb-2 italic">
        {financialTenantConfig.disclaimer}
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        <button
          onClick={() => onSendMessage('Check account balance')}
          className="text-xs bg-white border border-green-200 text-green-700 px-2 py-1 rounded-full hover:bg-green-100 transition-colors"
        >
          Check Balance
        </button>
        <button
          onClick={handleCheckTransaction}
          className="text-xs bg-white border border-green-200 text-green-700 px-2 py-1 rounded-full hover:bg-green-100 transition-colors"
        >
          Check Transaction
        </button>
      </div>
      {transactionStatus && (
        <p className="text-xs text-center mt-1 font-medium text-green-800">
          {transactionStatus}
        </p>
      )}
    </div>
  );
}
