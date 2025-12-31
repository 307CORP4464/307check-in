'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import DashboardHeader from '@/components/DashboardHeader';

interface DockStatus {
  dock_number: string;
  status: 'available' | 'in-use' | 'double-booked';
  orders: {
    id: string;
    po_number: string;
    driver_name: string;
    status: string;
    check_in_time: string;
  }[];
}

export default function DockStatusPage() {
  const [dockStatuses, setDockStatuses] = useState<DockStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDockStatuses();
    
    // Set up real-time subscription
    const channel = supabase
      .channel('dock-status-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'daily_log'
        },
        () => {
          fetchDockStatuses();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchDockStatuses = async () => {
    try {
      // Fetch all active orders (not completed)
      const { data: logs, error } = await supabase
        .from('daily_log')
        .select('*')
        .neq('status', 'complete')
        .order('dock_number')
        .order('check_in_time');

      if (error) throw error;

      // Group by dock number
      const dockMap = new Map<string, DockStatus>();
      
      // Initialize all docks (assuming docks 1-20, adjust as needed)
      for (let i = 1; i <= 20; i++) {
        const dockNum = i.toString();
        dockMap.set(dockNum, {
          dock_number: dockNum,
          status: 'available',
          orders: []
        });
      }

      // Process logs and assign to docks
      logs?.forEach((log) => {
        if (log.dock_number) {
          const dock = dockMap.get(log.dock_number) || {
            dock_number: log.dock_number,
            status: 'available' as const,
            orders: []
          };

          dock.orders.push({
            id: log.id,
            po_number: log.po_number,
            driver_name: log.driver_name,
            status: log.status,
            check_in_time: log.check_in_time
          });

          // Update status based on number of orders
          if (dock.orders.length === 1) {
            dock.status = 'in-use';
          } else if (dock.orders.length > 1) {
            dock.status = 'double-booked';
          }

          dockMap.set(log.dock_number, dock);
        }
      });

      setDockStatuses(Array.from(dockMap.values()).sort((a, b) => 
        parseInt(a.dock_number) - parseInt(b.dock_number)
      ));
    } catch (error) {
      console.error('Error fetching dock statuses:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'in-use':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'double-booked':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'available':
        return '✓';
      case 'in-use':
        return '●';
      case 'double-booked':
        return '⚠';
      default:
        return '';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <DashboardHeader />
        <div className="flex items-center justify-center h-96">
          <div className="text-gray-600">Loading dock statuses...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Dock Status</h1>
          <p className="mt-2 text-gray-600">Real-time dock availability and assignments</p>
        </div>

        {/* Legend */}
        <div className="mb-6 flex gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-500 rounded"></div>
            <span className="text-sm text-gray-700">Available</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-yellow-500 rounded"></div>
            <span className="text-sm text-gray-700">In Use</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-500 rounded"></div>
            <span className="text-sm text-gray-700">Double Booked</span>
          </div>
        </div>

        {/* Dock Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {dockStatuses.map((dock) => (
            <div
              key={dock.dock_number}
              className={`relative border-2 rounded-lg p-4 transition-all hover:shadow-lg ${getStatusColor(
                dock.status
              )}`}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-bold">Dock {dock.dock_number}</h3>
                <span className="text-2xl">{getStatusIcon(dock.status)}</span>
              </div>
              
              <div className="text-sm font-semibold capitalize mb-2">
                {dock.status.replace('-', ' ')}
              </div>

              {dock.orders.length > 0 && (
                <div className="mt-3 pt-3 border-t border-current border-opacity-20">
                  <div className="text-xs font-semibold mb-1">Assigned Orders:</div>
                  {dock.orders.map((order, idx) => (
                    <div key={order.id} className="text-xs mb-2 bg-white bg-opacity-50 p-2 rounded">
                      <div className="font-semibold">PO: {order.po_number}</div>
                      <div>{order.driver_name}</div>
                      <div className="text-opacity-75 capitalize">{order.status}</div>
                      {idx < dock.orders.length - 1 && (
                        <div className="mt-1 pt-1 border-t border-current border-opacity-20"></div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Detailed View */}
        <div className="mt-8 bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Detailed Status</h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Dock #
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Orders
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {dockStatuses.map((dock) => (
                  <tr key={dock.dock_number} className={dock.status === 'double-booked' ? 'bg-red-50' : ''}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      Dock {dock.dock_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          dock.status === 'available'
                            ? 'bg-green-100 text-green-800'
                            : dock.status === 'in-use'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {dock.status.replace('-', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {dock.orders.length}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {dock.orders.length > 0 ? (
                        <div className="space-y-1">
                          {dock.orders.map((order) => (
                            <div key={order.id}>
                              <span className="font-medium">{order.po_number}</span> - {order.driver_name} ({order.status})
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400">No active orders</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
