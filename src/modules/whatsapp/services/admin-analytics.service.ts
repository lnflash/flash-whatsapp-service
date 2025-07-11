import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { TransactionService } from '../../flash-api/services/transaction.service';
import { SessionService } from '../../auth/services/session.service';
import { UsernameService } from '../../flash-api/services/username.service';
import { AdminSettingsService } from './admin-settings.service';

export interface TransactionSummary {
  totalAmount: number;
  totalCount: number;
  averageAmount: number;
  largestTransaction: number;
  type: 'sent' | 'received';
}

export interface UserActivitySummary {
  activeUsers: number;
  newUsers: number;
  totalTransactions: number;
  topUsers: Array<{ username: string; transactionCount: number; volume: number }>;
}

export interface SystemHealthMetrics {
  totalUsers: number;
  linkedUsers: number;
  pendingPayments: number;
  failedTransactions: number;
  uptime: number;
  redisMemory: string;
}

@Injectable()
export class AdminAnalyticsService {
  private readonly logger = new Logger(AdminAnalyticsService.name);
  private readonly ANALYTICS_KEY_PREFIX = 'analytics:';
  private readonly TRANSACTION_LOG_PREFIX = 'tx_log:';
  private readonly USER_ACTIVITY_PREFIX = 'user_activity_log:';

  constructor(
    private readonly redisService: RedisService,
    private readonly transactionService: TransactionService,
    private readonly sessionService: SessionService,
    private readonly usernameService: UsernameService,
    private readonly adminSettingsService: AdminSettingsService,
  ) {}

  /**
   * Log transaction for analytics
   */
  async logTransaction(
    userId: string,
    amount: number,
    type: 'sent' | 'received',
    recipient?: string,
    transactionId?: string,
  ): Promise<void> {
    try {
      const date = new Date();
      const dayKey = `${this.TRANSACTION_LOG_PREFIX}${date.toISOString().split('T')[0]}`;

      const transaction = {
        userId,
        amount,
        type,
        recipient,
        transactionId,
        timestamp: date.toISOString(),
      };

      // Store in daily log
      const existing = await this.redisService.get(dayKey);
      const logs = existing ? JSON.parse(existing) : [];
      logs.push(transaction);

      await this.redisService.set(dayKey, JSON.stringify(logs), 86400 * 30); // Keep for 30 days
    } catch (error) {
      this.logger.error(`Error logging transaction: ${error.message}`);
    }
  }

  /**
   * Log user activity
   */
  async logUserActivity(userId: string, activity: string): Promise<void> {
    try {
      const date = new Date();
      const dayKey = `${this.USER_ACTIVITY_PREFIX}${date.toISOString().split('T')[0]}`;

      const activityLog = {
        userId,
        activity,
        timestamp: date.toISOString(),
      };

      // Store in daily log
      const existing = await this.redisService.get(dayKey);
      const logs = existing ? JSON.parse(existing) : [];
      logs.push(activityLog);

      await this.redisService.set(dayKey, JSON.stringify(logs), 86400 * 30); // Keep for 30 days
    } catch (error) {
      this.logger.error(`Error logging user activity: ${error.message}`);
    }
  }

  /**
   * Get daily transaction summary
   */
  async getDailyTransactionSummary(date?: Date): Promise<{
    sent: TransactionSummary;
    received: TransactionSummary;
    netFlow: number;
  }> {
    try {
      const targetDate = date || new Date();
      const dayKey = `${this.TRANSACTION_LOG_PREFIX}${targetDate.toISOString().split('T')[0]}`;

      const data = await this.redisService.get(dayKey);
      if (!data) {
        return {
          sent: {
            totalAmount: 0,
            totalCount: 0,
            averageAmount: 0,
            largestTransaction: 0,
            type: 'sent',
          },
          received: {
            totalAmount: 0,
            totalCount: 0,
            averageAmount: 0,
            largestTransaction: 0,
            type: 'received',
          },
          netFlow: 0,
        };
      }

      const transactions = JSON.parse(data);
      const sent = transactions.filter((t: any) => t.type === 'sent');
      const received = transactions.filter((t: any) => t.type === 'received');

      const sentSummary: TransactionSummary = {
        totalAmount: sent.reduce((sum: number, t: any) => sum + t.amount, 0),
        totalCount: sent.length,
        averageAmount:
          sent.length > 0
            ? sent.reduce((sum: number, t: any) => sum + t.amount, 0) / sent.length
            : 0,
        largestTransaction: sent.length > 0 ? Math.max(...sent.map((t: any) => t.amount)) : 0,
        type: 'sent',
      };

      const receivedSummary: TransactionSummary = {
        totalAmount: received.reduce((sum: number, t: any) => sum + t.amount, 0),
        totalCount: received.length,
        averageAmount:
          received.length > 0
            ? received.reduce((sum: number, t: any) => sum + t.amount, 0) / received.length
            : 0,
        largestTransaction:
          received.length > 0 ? Math.max(...received.map((t: any) => t.amount)) : 0,
        type: 'received',
      };

      return {
        sent: sentSummary,
        received: receivedSummary,
        netFlow: receivedSummary.totalAmount - sentSummary.totalAmount,
      };
    } catch (error) {
      this.logger.error(`Error getting daily summary: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get weekly transaction summary
   */
  async getWeeklyTransactionSummary(): Promise<
    Array<{
      date: string;
      sent: TransactionSummary;
      received: TransactionSummary;
    }>
  > {
    try {
      const summaries = [];
      const today = new Date();

      for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);

        const summary = await this.getDailyTransactionSummary(date);
        summaries.push({
          date: date.toISOString().split('T')[0],
          sent: summary.sent,
          received: summary.received,
        });
      }

      return summaries.reverse(); // Oldest to newest
    } catch (error) {
      this.logger.error(`Error getting weekly summary: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get user activity insights
   */
  async getUserActivityInsights(date?: Date): Promise<UserActivitySummary> {
    try {
      const targetDate = date || new Date();
      const dayKey = `${this.USER_ACTIVITY_PREFIX}${targetDate.toISOString().split('T')[0]}`;
      const txKey = `${this.TRANSACTION_LOG_PREFIX}${targetDate.toISOString().split('T')[0]}`;

      const activityData = await this.redisService.get(dayKey);
      const txData = await this.redisService.get(txKey);

      const activities = activityData ? JSON.parse(activityData) : [];
      const transactions = txData ? JSON.parse(txData) : [];

      // Count unique active users
      const activeUserIds = new Set([
        ...activities.map((a: any) => a.userId),
        ...transactions.map((t: any) => t.userId),
      ]);

      // Count new users (those who linked today)
      const newUsers = activities.filter((a: any) => a.activity === 'account_linked').length;

      // Get top users by transaction count and volume
      const userStats = new Map<string, { count: number; volume: number }>();

      for (const tx of transactions) {
        if (!userStats.has(tx.userId)) {
          userStats.set(tx.userId, { count: 0, volume: 0 });
        }
        const stats = userStats.get(tx.userId)!;
        stats.count++;
        stats.volume += tx.amount;
      }

      // Sort and get top 5 users
      const topUsers = await Promise.all(
        Array.from(userStats.entries())
          .sort((a, b) => b[1].volume - a[1].volume)
          .slice(0, 5)
          .map(async ([userId, stats]) => {
            // Try to get username
            let username = 'Unknown';
            try {
              const session = await this.sessionService.getSession(userId);
              if (session?.flashAuthToken) {
                username =
                  (await this.usernameService.getUsername(session.flashAuthToken)) || 'Unknown';
              }
            } catch (error) {
              // Ignore username fetch errors
            }

            return {
              username,
              transactionCount: stats.count,
              volume: stats.volume,
            };
          }),
      );

      return {
        activeUsers: activeUserIds.size,
        newUsers,
        totalTransactions: transactions.length,
        topUsers,
      };
    } catch (error) {
      this.logger.error(`Error getting user activity insights: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get system health metrics
   */
  async getSystemHealthMetrics(): Promise<SystemHealthMetrics> {
    try {
      // Get total users
      const sessions = await this.sessionService.getAllSessions();
      const totalUsers = sessions.length;
      const linkedUsers = sessions.filter((s) => s.isVerified).length;

      // Count pending payments
      const pendingKeys = await this.redisService.keys('pending_payment:*');
      const pendingPayments = pendingKeys.length;

      // Count failed transactions (from today's logs)
      const today = new Date();
      const dayKey = `${this.USER_ACTIVITY_PREFIX}${today.toISOString().split('T')[0]}`;
      const activityData = await this.redisService.get(dayKey);
      const activities = activityData ? JSON.parse(activityData) : [];
      const failedTransactions = activities.filter(
        (a: any) => a.activity === 'transaction_failed',
      ).length;

      // Calculate uptime (simplified - time since last restart)
      const uptimeMs = process.uptime() * 1000;
      const uptime = Math.floor(uptimeMs / (1000 * 60 * 60)); // Hours

      // Get Redis memory usage
      const redisInfo = await this.redisService.info();
      const memoryMatch = redisInfo.match(/used_memory_human:([^\r\n]+)/);
      const redisMemory = memoryMatch ? memoryMatch[1] : 'Unknown';

      return {
        totalUsers,
        linkedUsers,
        pendingPayments,
        failedTransactions,
        uptime,
        redisMemory,
      };
    } catch (error) {
      this.logger.error(`Error getting system health metrics: ${error.message}`);
      throw error;
    }
  }

  /**
   * Format analytics report for admin
   */
  async formatAnalyticsReport(period: 'daily' | 'weekly'): Promise<string> {
    try {
      let report = `📊 *Analytics Report - ${period === 'daily' ? 'Today' : 'Last 7 Days'}*\n\n`;

      if (period === 'daily') {
        const summary = await this.getDailyTransactionSummary();
        const activity = await this.getUserActivityInsights();
        const health = await this.getSystemHealthMetrics();

        report += `💸 *Transaction Summary*\n`;
        report += `• Sent: $${summary.sent.totalAmount.toFixed(2)} (${summary.sent.totalCount} txs)\n`;
        report += `• Received: $${summary.received.totalAmount.toFixed(2)} (${summary.received.totalCount} txs)\n`;
        report += `• Net Flow: ${summary.netFlow >= 0 ? '+' : ''}$${summary.netFlow.toFixed(2)}\n`;
        report += `• Avg Transaction: $${((summary.sent.averageAmount + summary.received.averageAmount) / 2).toFixed(2)}\n\n`;

        report += `👥 *User Activity*\n`;
        report += `• Active Users: ${activity.activeUsers}\n`;
        report += `• New Users: ${activity.newUsers}\n`;
        report += `• Total Transactions: ${activity.totalTransactions}\n\n`;

        if (activity.topUsers.length > 0) {
          report += `🏆 *Top Users*\n`;
          activity.topUsers.forEach((user, index) => {
            report += `${index + 1}. @${user.username} - $${user.volume.toFixed(2)} (${user.transactionCount} txs)\n`;
          });
          report += `\n`;
        }

        report += `🏥 *System Health*\n`;
        report += `• Total Users: ${health.totalUsers} (${health.linkedUsers} linked)\n`;
        report += `• Pending Payments: ${health.pendingPayments}\n`;
        report += `• Failed Transactions: ${health.failedTransactions}\n`;
        report += `• Uptime: ${health.uptime} hours\n`;
        report += `• Redis Memory: ${health.redisMemory}\n`;
      } else {
        // Weekly report
        const weekly = await this.getWeeklyTransactionSummary();

        let totalSent = 0;
        let totalReceived = 0;
        let totalTxCount = 0;

        report += `📈 *7-Day Trend*\n`;
        weekly.forEach((day) => {
          const netFlow = day.received.totalAmount - day.sent.totalAmount;
          report += `• ${day.date}: ${netFlow >= 0 ? '🟢' : '🔴'} $${Math.abs(netFlow).toFixed(2)}\n`;
          totalSent += day.sent.totalAmount;
          totalReceived += day.received.totalAmount;
          totalTxCount += day.sent.totalCount + day.received.totalCount;
        });

        report += `\n💰 *Weekly Totals*\n`;
        report += `• Total Sent: $${totalSent.toFixed(2)}\n`;
        report += `• Total Received: $${totalReceived.toFixed(2)}\n`;
        report += `• Total Transactions: ${totalTxCount}\n`;
        report += `• Daily Average: $${((totalSent + totalReceived) / 7).toFixed(2)}\n`;

        // Get current health metrics
        const health = await this.getSystemHealthMetrics();
        report += `\n🏥 *Current Status*\n`;
        report += `• Active Users: ${health.linkedUsers}/${health.totalUsers}\n`;
        report += `• System Uptime: ${health.uptime} hours\n`;
      }

      return report;
    } catch (error) {
      this.logger.error(`Error formatting analytics report: ${error.message}`);
      return '❌ Error generating analytics report.';
    }
  }

  /**
   * Check if user is admin before showing analytics
   */
  async isAuthorizedForAnalytics(phoneNumber: string): Promise<boolean> {
    return this.adminSettingsService.isAdmin(phoneNumber);
  }
}
