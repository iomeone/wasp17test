import { Listbox, ListboxItem } from "@heroui/react";
import { useNavigate } from 'react-router-dom';

export function Sidebar() {
  const navigate = useNavigate();

  // 当 ListboxItem 被点击时，这个函数会以 item 的 key 作为参数被调用
  const handleNavigation = (key: React.Key) => {
    navigate(key as string);
  };

  return (
    <div className="w-64 h-screen p-4 border-r border-gray-200 bg-white">
      <div className="p-4 mb-4 text-2xl font-bold">
        ....
      </div>
      <Listbox
        aria-label="Navigation"
        onAction={handleNavigation} // 使用 onAction 统一处理导航
      >
        <ListboxItem key="/" textValue="Home"> {/* 路由路径作为 key */}
          Home
        </ListboxItem>
        <ListboxItem key="/dashboard" textValue="Dashboard"> {/* 路由路径作为 key */}
          Dashboard
        </ListboxItem>
        <ListboxItem key="/settings" textValue="Settings"> {/* 路由路径作为 key */}
          Settings
        </ListboxItem>
      </Listbox>
    </div>
  );
}