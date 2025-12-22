import Link from 'next/link';
import { Truck, Users } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            307 Warehouse Check-In
          </h1>
          <p className="text-xl text-gray-600">
            Select your portal to continue
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Driver Portal */}
          <Link href="/check-in">
            <div className="bg-white rounded-xl shadow-lg p-8 hover:shadow-2xl transition-shadow cursor-pointer border-2 border-transparent hover:border-blue-500">
              <div className="flex flex-col items-center text-center">
                <div className="bg-blue-100 p-6 rounded-full mb-6">
                  <Truck className="text-blue-600" size={64} />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-3">
                  Driver Check-In
                </h2>
                <p className="text-gray-600">
                  Complete your check-in form for pickup
                </p>
              </div>
            </div>
          </Link>

          {/* CSR Portal */}
          <Link href="/dashboard">
            <div className="bg-white rounded-xl shadow-lg p-8 hover:shadow-2xl transition-shadow cursor-pointer border-2 border-transparent hover:border-blue-500">
              <div className="flex flex-col items-center text-center">
                <div className="bg-indigo-100 p-6 rounded-full mb-6">
                  <Users className="text-indigo-600" size={64} />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-3">
                  CSR Dashboard
                </h2>
                <p className="text-gray-600">
                  Manage check-ins and assign docks
                </p>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
