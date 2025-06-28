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
    console.error('Usage: ts-node scripts/test-invoice-payment.ts [paymentHash] [amount]');
    console.error('Example: ts-node scripts/test-invoice-payment.ts 157394127221537680b2041b93cf79e55775ad094e1611d9bcb6703a17664cd2 1');
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
    
    if (sent) {
      console.log('✅ Payment event sent successfully!');
      console.log('Event:', JSON.stringify(event, null, 2));
    } else {
      console.error('❌ Failed to send payment event');
    }
    
    // Cleanup
    await channel.close();
    await connection.close();
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testInvoicePayment();