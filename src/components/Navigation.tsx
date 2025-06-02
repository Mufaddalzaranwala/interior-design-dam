import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Home, 
  Search, 
  Upload, 
  Building, 
  Users, 
  Settings, 
  LogOut, 
  Menu, 
  X, 
  ChevronDown,
  BarChart3,
  HardDrive,
  Shield,
  Bell,
  User
} from 'lucide-react';
import { Button } from './ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useSites } from '@/hooks/useSites';
import { cn, getInitials } from '@/lib/utils';
import type { NavItem } from '@/types';

interface NavigationProps {
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  className?: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: Home,
  },
  {
    label: 'Search',
    href: '/dashboard/search',
    icon: Search,
  },
  {
    label: 'Upload',
    href: '/dashboard/upload',
    icon: Upload,
  },
  {
    label: 'Admin',
    href: '/dashboard/admin',
    icon: Settings,
    adminOnly: true,
    children: [
      {
        label: 'Overview',
        href: '/dashboard/admin',
        icon: BarChart3,
      },
      {
        label: 'Sites',
        href: '/dashboard/admin/sites',
        icon: Building,
      },
      {
        label: 'Users',
        href: '/dashboard/admin/users',
        icon: Users,
      },
      {
        label: 'System',
        href: '/dashboard/admin/system',
        icon: HardDrive,
      },
    ],
  },
];

export const Navigation: React.FC<NavigationProps> = ({
  collapsed = false,
  onCollapsedChange,
  className,
}) => {
  const pathname = usePathname();
  const { user, logout, isAdmin } = useAuth();
  const { siteStats } = useSites();
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const toggleExpanded = (itemLabel: string) => {
    setExpandedItems(prev =>
      prev.includes(itemLabel)
        ? prev.filter(item => item !== itemLabel)
        : [...prev, itemLabel]
    );
  };

  const isItemActive = (item: NavItem): boolean => {
    if (item.href === pathname) return true;
    if (item.children) {
      return item.children.some(child => pathname.startsWith(child.href));
    }
    return pathname.startsWith(item.href);
  };

  const isItemExpanded = (item: NavItem): boolean => {
    return expandedItems.includes(item.label) || (item.children?.some(child => pathname.startsWith(child.href)) ?? false);
  };

  const filteredNavItems = NAV_ITEMS.filter(item => !item.adminOnly || isAdmin);

  return (
    <nav className={cn(
      'flex flex-col h-full bg-white border-r border-gray-200 transition-all duration-300',
      collapsed ? 'w-16' : 'w-64',
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        {!collapsed && (
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Building className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-gray-900">DAM</h1>
              <p className="text-xs text-gray-500">Interior Design</p>
            </div>
          </div>
        )}
        
        {onCollapsedChange && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onCollapsedChange(!collapsed)}
            className="p-2"
          >
            {collapsed ? <Menu className="w-4 h-4" /> : <X className="w-4 h-4" />}
          </Button>
        )}
      </div>

      {/* User Info */}
      {user && (
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
              <span className="text-sm font-medium text-gray-700">
                {getInitials(user.name)}
              </span>
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
                <p className="text-xs text-gray-500 capitalize">{user.role}</p>
              </div>
            )}
          </div>
          
          {!collapsed && siteStats && (
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="text-center p-2 bg-gray-50 rounded">
                <div className="font-medium text-gray-900">{siteStats.totalSites}</div>
                <div className="text-gray-500">Sites</div>
              </div>
              <div className="text-center p-2 bg-gray-50 rounded">
                <div className="font-medium text-gray-900">{siteStats.totalFiles}</div>
                <div className="text-gray-500">Files</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Navigation Items */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-2 space-y-1">
          {filteredNavItems.map((item) => (
            <NavigationItem
              key={item.label}
              item={item}
              collapsed={collapsed}
              isActive={isItemActive(item)}
              isExpanded={isItemExpanded(item)}
              onToggleExpanded={() => toggleExpanded(item.label)}
            />
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 space-y-2">
        {!collapsed && (
          <div className="text-xs text-gray-500 space-y-1">
            <div className="flex justify-between">
              <span>Upload Access:</span>
              <span>{siteStats?.uploadableSitesCount || 0} sites</span>
            </div>
            <div className="flex justify-between">
              <span>View Access:</span>
              <span>{siteStats?.viewOnlySitesCount || 0} sites</span>
            </div>
          </div>
        )}
        
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className={cn(
            'w-full justify-start',
            collapsed && 'justify-center px-2'
          )}
        >
          <LogOut className="w-4 h-4" />
          {!collapsed && <span className="ml-2">Logout</span>}
        </Button>
      </div>
    </nav>
  );
};

interface NavigationItemProps {
  item: NavItem;
  collapsed: boolean;
  isActive: boolean;
  isExpanded: boolean;
  onToggleExpanded: () => void;
}

const NavigationItem: React.FC<NavigationItemProps> = ({
  item,
  collapsed,
  isActive,
  isExpanded,
  onToggleExpanded,
}) => {
  const hasChildren = item.children && item.children.length > 0;

  if (hasChildren && !collapsed) {
    return (
      <div>
        <button
          onClick={onToggleExpanded}
          className={cn(
            'w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-md transition-colors',
            isActive
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-700 hover:bg-gray-100'
          )}
        >
          <div className="flex items-center space-x-3">
            <item.icon className="w-5 h-5" />
            <span>{item.label}</span>
          </div>
          <ChevronDown className={cn(
            'w-4 h-4 transition-transform',
            isExpanded && 'transform rotate-180'
          )} />
        </button>
        
        {isExpanded && (
          <div className="ml-4 mt-1 space-y-1">
            {item.children.map((child) => (
              <Link
                key={child.href}
                href={child.href}
                className={cn(
                  'flex items-center space-x-3 px-3 py-2 text-sm rounded-md transition-colors',
                  child.href === window.location.pathname
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                )}
              >
                <child.icon className="w-4 h-4" />
                <span>{child.label}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
        collapsed ? 'justify-center' : 'space-x-3',
        isActive
          ? 'bg-blue-100 text-blue-700'
          : 'text-gray-700 hover:bg-gray-100'
      )}
      title={collapsed ? item.label : undefined}
    >
      <item.icon className="w-5 h-5" />
      {!collapsed && <span>{item.label}</span>}
      {item.badge && !collapsed && (
        <span className="ml-auto bg-red-500 text-white text-xs rounded-full px-2 py-1">
          {item.badge}
        </span>
      )}
    </Link>
  );
};

// Mobile Navigation
export const MobileNavigation: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const { user, logout, isAdmin } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const filteredNavItems = NAV_ITEMS.filter(item => !item.adminOnly || isAdmin);

  return (
    <>
      {/* Mobile Header */}
      <div className="lg:hidden flex items-center justify-between p-4 bg-white border-b border-gray-200">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Building className="w-5 h-5 text-white" />
          </div>
          <h1 className="font-bold text-lg text-gray-900">DAM</h1>
        </div>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsOpen(true)}
        >
          <Menu className="w-5 h-5" />
        </Button>
      </div>

      {/* Mobile Overlay */}
      {isOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-gray-600 bg-opacity-75"
            onClick={() => setIsOpen(false)}
          />
          
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white">
            <div className="absolute top-0 right-0 -mr-12 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="text-white hover:text-gray-200"
              >
                <X className="w-6 h-6" />
              </Button>
            </div>

            {/* Mobile Nav Content */}
            <div className="flex-1 h-0 pt-5 pb-4 overflow-y-auto">
              <div className="flex-shrink-0 flex items-center px-4">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <Building className="w-5 h-5 text-white" />
                </div>
                <h1 className="ml-2 font-bold text-lg text-gray-900">DAM</h1>
              </div>
              
              {/* User Info */}
              {user && (
                <div className="mt-5 px-4">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center">
                        <span className="text-sm font-medium text-gray-700">
                          {getInitials(user.name)}
                        </span>
                      </div>
                    </div>
                    <div className="ml-3">
                      <p className="text-base font-medium text-gray-800">{user.name}</p>
                      <p className="text-sm font-medium text-gray-500 capitalize">{user.role}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Navigation */}
              <nav className="mt-5 px-2 space-y-1">
                {filteredNavItems.map((item) => {
                  if (item.children) {
                    return (
                      <div key={item.label}>
                        <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          {item.label}
                        </div>
                        {item.children.map((child) => (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={() => setIsOpen(false)}
                            className={cn(
                              'group flex items-center px-2 py-2 text-base font-medium rounded-md',
                              pathname === child.href
                                ? 'bg-blue-100 text-blue-700'
                                : 'text-gray-700 hover:bg-gray-100'
                            )}
                          >
                            <child.icon className="mr-4 h-6 w-6" />
                            {child.label}
                          </Link>
                        ))}
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setIsOpen(false)}
                      className={cn(
                        'group flex items-center px-2 py-2 text-base font-medium rounded-md',
                        pathname === item.href
                          ? 'bg-blue-100 text-blue-700'
                          : 'text-gray-700 hover:bg-gray-100'
                      )}
                    >
                      <item.icon className="mr-4 h-6 w-6" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* Mobile Footer */}
            <div className="flex-shrink-0 flex border-t border-gray-200 p-4">
              <Button
                variant="ghost"
                onClick={handleLogout}
                className="w-full justify-start"
              >
                <LogOut className="mr-3 h-6 w-6" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Navigation;