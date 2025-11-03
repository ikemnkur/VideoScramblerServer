import React, { useState, useEffect } from 'react';
import { Table, Input, Button } from '@/components/ui/table';

const AdminDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const response = await fetch('/api/admin');
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const result = await response.json();
      setData(result);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const filteredVisits = data?.pageVisits.filter(visit => 
    visit.url.toLowerCase().includes(filter.toLowerCase()) ||
    visit.ip.includes(filter) ||
    visit.location.toLowerCase().includes(filter.toLowerCase())
  );

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Admin Dashboard</h1>
      
      <div className="mb-4">
        <h2 className="text-xl font-semibold">Server Uptime</h2>
        <p>{Math.floor(data.uptime / (1000 * 60 * 60))} hours</p>
      </div>

      <div className="mb-4">
        <h2 className="text-xl font-semibold">Page Visits</h2>
        <Input
          type="text"
          placeholder="Filter visits..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="mb-2"
        />
        <Table>
          <thead>
            <tr>
              <th>Count</th>
              <th>URL</th>
              <th>Time</th>
              <th>IP</th>
              <th>Location</th>
            </tr>
          </thead>
          <tbody>
            {filteredVisits.map((visit, index) => (
              <tr key={index}>
                <td>{visit.count}</td>
                <td>{visit.url}</td>
                <td>{visit.time}</td>
                <td>{visit.ip}</td>
                <td>{visit.location}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      <div className="mb-4">
        <h2 className="text-xl font-semibold">Recent Requests</h2>
        <Table>
          <thead>
            <tr>
              <th>Method</th>
              <th>URL</th>
              <th>Time</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {data.recentRequests.map((request, index) => (
              <tr key={index}>
                <td>{request.method}</td>
                <td>{request.url}</td>
                <td>{request.time}</td>
                <td>{request.ip}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      <Button onClick={fetchData}>Refresh Data</Button>
    </div>
  );
};

export default AdminDashboard;