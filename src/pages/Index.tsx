const Index = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-indigo-100">
      <div className="text-center p-8 rounded-2xl shadow-xl bg-white max-w-xl">
        <h1 className="text-5xl font-extrabold text-indigo-600 mb-6">🚀 FreeRADIUS M-Pesa Dashboard</h1>
        <p className="text-lg text-gray-700 mb-4">
          Manage your RADIUS clients and track M-Pesa transactions with ease.
        </p>
        <p className="text-sm text-gray-500 mb-8">
          Laravel + Charts + M-Pesa API Integration
        </p>
        <a
          href="/login"
          className="inline-block px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition"
        >
          Get Started
        </a>
      </div>
    </div>
  );
};

export default Index;
