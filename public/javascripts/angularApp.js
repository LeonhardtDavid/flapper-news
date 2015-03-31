var app = angular.module('flapperNews', ['ui.router', 'angularMoment']);

app.controller('MainCtrl', [
    '$scope',
    'posts',
    'auth',
    function ($scope, posts, auth) {

        $scope.isLoggedIn = auth.isLoggedIn;

        $scope.posts = posts.posts;

        $scope.sortTypes = [
            {value: "-title", label: "Por título"},
            {value: "-upvotes", label: "Por votos"},
            {value: "-date", label: "Por fecha"}
        ];
        $scope.sortBy = $scope.sortTypes[0].value;

        $scope.addPost = function () {
            if (!$scope.title || $scope.title === '') {
                return;
            }
            posts.create({
                title: $scope.title,
                link: $scope.link
            });
            $scope.title = '';
            $scope.link = '';
        };

        $scope.incrementUpvotes = function (post) {
            posts.upvote(post);
        };

    }
]);

app.controller('PostsCtrl', [
    '$scope',
    'posts',
    'post',
    'auth',
    function ($scope, posts, post, auth) {

        $scope.isLoggedIn = auth.isLoggedIn;

        $scope.post = post;

        $scope.addComment = function () {
            if ($scope.body === '') {
                return;
            }
            posts.addComment(post._id, {
                body: $scope.body,
                author: 'user'
            }).success(function (comment) {
                $scope.post.comments.push(comment);
            });
            $scope.body = '';
        };

        $scope.incrementUpvotes = function (comment) {
            posts.upvoteComment(post, comment);
        };

    }
]);

app.controller('NavCtrl', [
    '$scope',
    'auth',
    function ($scope, auth) {
        $scope.isLoggedIn = auth.isLoggedIn;
        $scope.currentUser = auth.currentUser;
        $scope.logOut = auth.logOut;
    }
]);

app.controller('AuthCtrl', [
    '$scope',
    '$state',
    'auth',
    function ($scope, $state, auth) {
        $scope.user = {};

        $scope.register = function () {
            auth.register($scope.user).error(function (error) {
                $scope.error = error;
            }).then(function () {
                $state.go('home');
            });
        };

        $scope.logIn = function () {
            auth.logIn($scope.user).error(function (error) {
                $scope.error = error;
            }).then(function () {
                $state.go('home');
            });
        };
    }
]);

app.factory('posts', ['$http', function ($http) {
    var o = {
        posts: []
    };

    o.getAll = function () {
        return $http.get('/posts')
            .success(function (data) {
                angular.copy(data, o.posts);
            });
    };

    o.create = function (post) {
        return $http.post('/posts', post).success(function (data) {
            o.posts.push(data);
        });
    };

    o.upvote = function (post) {
        return $http.put('/posts/' + post._id + '/upvote')
            .success(function (data) {
                post.upvotes += 1;
            });
    };

    o.get = function (id) {
        return $http.get('/posts/' + id).then(function (res) {
            return res.data;
        });
    };

    o.addComment = function (id, comment) {
        return $http.post('/posts/' + id + '/comments', comment);
    };

    o.upvoteComment = function (post, comment) {
        return $http.put('/posts/' + post._id + '/comments/' + comment._id + '/upvote')
            .success(function (data) {
                comment.upvotes += 1;
            });
    };

    return o;
}]);

app.factory('authInterceptor', [
    '$q',
    '$window',
    '$location',
    'authToken',
    function ($q, $window, $location, authToken) {
        return {
            request: function (config) {
                config.headers = config.headers || {};
                var token = authToken.getToken();
                if (token) {
                    config.headers.Authorization = 'Bearer ' + token;
                }
                return config;
            },
            response: function (response) {
                return $q.when(response);
            },
            responseError: function (rejection) {
                if (rejection.status === 401) {
                    // handle the case where the user is not authenticated
                    authToken.logOut();
                    $location.path('/login');
                }
                return $q.reject(rejection); // use only promise api here, or all would be a success
            }
        };
    }
]);

app.factory('authToken', [
    '$window',
    function ($window) {
        var authToken = {};

        authToken.saveToken = function (token) {
            $window.localStorage['flapper-news-token'] = token;
        };

        authToken.getToken = function () {
            return $window.localStorage['flapper-news-token'];
        };

        authToken.removeToken = function () {
            $window.localStorage.removeItem('flapper-news-token');
        };

        return authToken;
    }
]);

app.factory('auth', [
    '$http',
    '$window',
    'authToken',
    function ($http, $window, authToken) {
        var auth = {};

        auth.isLoggedIn = function () {
            var token = authToken.getToken();

            if (token) {
                var payload = JSON.parse($window.atob(token.split('.')[1]));

                return payload.exp > Date.now() / 1000;
            } else {
                return false;
            }
        };

        auth.currentUser = function () {
            if (auth.isLoggedIn()) {
                var token = authToken.getToken();
                var payload = JSON.parse($window.atob(token.split('.')[1]));

                return payload.username;
            }
        };

        auth.register = function (user) {
            return $http.post('/register', user).success(function (data) {
                authToken.saveToken(data.token);
            });
        };

        auth.logIn = function (user) {
            return $http.post('/login', user).success(function (data) {
                authToken.saveToken(data.token);
            });
        };

        auth.logOut = function () {
            authToken.removeToken();
        };

        return auth;
    }
]);

app.config([
    '$stateProvider',
    '$urlRouterProvider',
    '$httpProvider',
    function ($stateProvider, $urlRouterProvider, $httpProvider) {

        $httpProvider.interceptors.push('authInterceptor');

        $stateProvider
            .state('home', {
                url: '/home',
                templateUrl: '/home.html',
                controller: 'MainCtrl',
                resolve: {
                    postPromise: ['posts', function (posts) {
                        return posts.getAll();
                    }]
                }
            })
            .state('posts', {
                url: '/posts/{id}',
                templateUrl: '/posts.html',
                controller: 'PostsCtrl',
                resolve: {
                    post: ['$stateParams', 'posts', function ($stateParams, posts) {
                        return posts.get($stateParams.id);
                    }]
                }
            })
            .state('login', {
                url: '/login',
                templateUrl: '/login.html',
                controller: 'AuthCtrl',
                onEnter: ['$state', 'auth', function ($state, auth) {
                    if (auth.isLoggedIn()) {
                        $state.go('home');
                    }
                }]
            })
            .state('register', {
                url: '/register',
                templateUrl: '/register.html',
                controller: 'AuthCtrl',
                onEnter: ['$state', 'auth', function ($state, auth) {
                    if (auth.isLoggedIn()) {
                        $state.go('home');
                    }
                }]
            });

        $urlRouterProvider.otherwise('home');

    }
]);
