import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Calendar, Search, Package, CheckCircle, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const DailyLog = () => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loads, setLoads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLoads();
  }, [selectedDate]);

  const fetchLoads = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/loads?date=${selectedDate}`);
      const data = await response.json();
      setLoads(data);
    } catch (error) {
      console.error('Error fetching loads:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      'Checked In': 'bg-blue-500',
      'Complete': 'bg-green-500',
      'Unloaded': 'bg-purple-500',
      'Rejected': 'bg-red-500',
      'Driver Left': 'bg-orange-500',
      'Turned Away': 'bg-yellow-500'
    };
    return colors[status] || 'bg-gray-500';
  };

  // Calculate stats
  const stats = useMemo(() => {
    const totalCheckedIn = loads.length;
    const finishedStatuses = ['Complete', 'Unloaded', 'Rejected', 'Driver Left', 'Turned Away'];
    const totalFinished = loads.filter(load => 
      finishedStatuses.includes(load.status)
    ).length;
    
    return { totalCheckedIn, totalFinished };
  }, [loads]);

  const filteredLoads = useMemo(() => {
    return loads.filter(load =>
      load.loadNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      load.carrier?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      load.driver?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [loads, searchTerm]);

  // Date navigation functions
  const changeDate = (days) => {
    const currentDate = new Date(selectedDate);
    currentDate.setDate(currentDate.getDate() + days);
    setSelectedDate(currentDate.toISOString().split('T')[0]);
  };

  const clearSearch = () => {
    setSearchTerm('');
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Daily Log</h1>
      
      {/* Controls and Stats Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6">
        {/* Date Selector with Navigation */}
        <div className="lg:col-span-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => changeDate(-1)}
                  className="h-10 w-10"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex-1 relative">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => changeDate(1)}
                  className="h-10 w-10"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Stat Cards */}
        <div className="lg:col-span-4 grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Checked In</p>
                  <p className="text-2xl font-bold">{stats.totalCheckedIn}</p>
                </div>
                <Package className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Finished</p>
                  <p className="text-2xl font-bold">{stats.totalFinished}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search Bar */}
        <div className="lg:col-span-5">
          <Card>
            <CardContent className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  type="text"
                  placeholder="Search by load #, carrier, or driver..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-10"
                />
                {searchTerm && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={clearSearch}
                    className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Loads Display */}
      {loading ? (
        <div className="text-center py-8">Loading...</div>
      ) : (
        <div className="grid gap-4">
          {filteredLoads.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                No loads found for the selected criteria
              </CardContent>
            </Card>
          ) : (
            filteredLoads.map((load) => (
              <Card key={load.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-xl">Load #{load.loadNumber}</CardTitle>
                      <p className="text-sm text-gray-600 mt-1">{load.carrier}</p>
                    </div>
                    <Badge className={`${getStatusColor(load.status)} text-white`}>
                      {load.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Driver</p>
                      <p className="text-sm">{load.driver || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Check-in Time</p>
                      <p className="text-sm">{load.checkInTime || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Door Assignment</p>
                      <p className="text-sm">{load.doorAssignment || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Completion Time</p>
                      <p className="text-sm">{load.completionTime || 'N/A'}</p>
                    </div>
                  </div>
                  {load.notes && (
                    <div className="mt-4">
                      <p className="text-sm font-medium text-gray-600">Notes</p>
                      <p className="text-sm">{load.notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default DailyLog;

