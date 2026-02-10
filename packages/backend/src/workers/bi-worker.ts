/**
 * JOB-02: BI worker – processes bi-refresh queue (materialized views).
 */
import { biRefreshQueue } from '../services/job-queue';
import { refreshMaterializedViews } from '../services/bi';

biRefreshQueue.process(async () => {
  console.log('Refreshing BI views...');
  await refreshMaterializedViews(true);
  console.log('BI views refreshed');
});
