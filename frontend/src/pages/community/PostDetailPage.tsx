import React from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { PostDetail } from './PostDetail';

/** 帖子详情独立路由页：支撑分享直链 /community/post/:postId */
export const PostDetailPage: React.FC = () => {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();

  if (!postId) {
    return <Navigate to="/community" replace />;
  }

  return <PostDetail postId={postId} onBack={() => navigate('/community')} />;
};
