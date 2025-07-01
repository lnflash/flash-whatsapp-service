#!/usr/bin/env ts-node

/**
 * Script to test invoice payment notification
 * Usage: ts-node scripts/test-invoice-payment.ts [paymentHash] [amount]
 */

import * as amqp from 'amqplib';

async function testInvoicePayment() {
  const paymentHash = process.argv[2];
  const amount = process.argv[3] || '1';

  if (!paymentHash) {
    process.exit(1);
  }

  try {
    // Connect to RabbitMQ
    const connection = await amqp.connect('amqp://localhost');
    const channel = await connection.createChannel();
    
    // Queue name from your configuration
    const queueName = 'flash_whatsapp_events';
    
    // Ensure queue exists
    await channel.assertQueue(queueName, { durable: true });
    
    // Create payment event
    const event = {
      type: 'payment_received',
      timestamp: new Date().toISOString(),
      data: {
        paymentHash: paymentHash,
        transactionId: `test-${Date.now()}`,
        amount: parseFloat(amount),
        senderName: 'Test Payer',
        memo: 'Test payment for invoice',
        timestamp: new Date().toISOString(),
        userId: 'test-user',
        whatsappId: '18764250250' // Your WhatsApp ID from the logs
      }
    };
    
    // Send event
    const sent = channel.sendToQueue(
      queueName,
      Buffer.from(JSON.stringify(event)),
      { persistent: true }
    );
    
    // Cleanup
    await channel.close();
    await connection.close();
    
  } catch (error) {
    process.exit(1);
  }
}

testInvoicePayment();